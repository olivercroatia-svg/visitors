import crypto from 'crypto';
import { env } from '../config/env';
import { loadCertificate } from './certStore';
import { signRacunZahtjev } from './sign';
import type {
  FiscalInvoice,
  FiscalizationProvider,
  FiscalizationResult,
  FiscalizationStatus,
} from './types';
import { buildRacunZahtjev, wrapSoap, type PaymentMethod } from './xml';
import { computeZki } from './zki';

// Talks to the tax authority's fiscalization service directly (no intermediary — the spec
// explicitly says none is foreseen). SOAP 1.1 over 1-way TLS; the certificate signs the
// message, it is not a TLS client certificate.

const REQUEST_TIMEOUT_MS = 10_000; // spec budgets ~2s of processing; 10s covers a bad line

const PAYMENT_MAP: Record<string, PaymentMethod> = {
  gotovina: 'G',
  kartica: 'K',
  transakcijski: 'T',
  ostalo: 'O',
};

// The two errors that mean "your data or your certificate is wrong". Re-sending an
// unchanged message can only produce the same rejection, so it must not be queued forever.
const PERMANENT_ERRORS = new Set(['s001', 's002', 's003', 's004', 's005']);

export class FinaProvider implements FiscalizationProvider {
  readonly name = 'fina';

  async fiscalize(invoice: FiscalInvoice): Promise<FiscalizationResult> {
    return this.send(invoice);
  }

  async cancel(invoice: FiscalInvoice): Promise<FiscalizationResult> {
    // A storno is a normal invoice with a negative total — the authority has no separate
    // "cancel" operation, which is exactly why our storno is its own document.
    return this.send(invoice);
  }

  async checkStatus(): Promise<FiscalizationStatus> {
    return { status: 'unknown' };
  }

  private async send(invoice: FiscalInvoice): Promise<FiscalizationResult> {
    const loaded = await loadCertificate(invoice.tenantId);
    if (!loaded) {
      return {
        status: 'failed',
        retryable: false,
        error: 'Nije učitan fiskalni certifikat. Dodajte ga u Postavke → Fiskalizacija.',
      };
    }
    const { cert, environment } = loaded;

    const oib = invoice.oib ?? cert.oib;
    if (!oib) {
      return { status: 'failed', retryable: false, error: 'Nedostaje OIB obveznika.' };
    }
    if (cert.oib && oib !== cert.oib) {
      return {
        status: 'failed',
        retryable: false,
        error: `OIB računa (${oib}) ne odgovara OIB-u iz certifikata (${cert.oib}).`,
      };
    }
    if (!invoice.operatorOib) {
      return {
        status: 'failed',
        retryable: false,
        error: 'Nedostaje OIB operatera. Unesite ga u Postavke.',
      };
    }

    const issued = parseSqlDatetime(invoice.issueDatetime);

    // The ZKI is computed from OUR data and OUR key, so it exists whether or not the
    // authority ever answers — and it goes on the receipt either way.
    const zki = computeZki(
      {
        oib,
        issueDatetime: issued,
        sequenceNumber: invoice.seq,
        premiseCode: invoice.premiseCode,
        deviceCode: invoice.deviceCode,
        total: invoice.total,
      },
      cert.privateKey,
    );

    const paymentMethod = PAYMENT_MAP[invoice.paymentMethod] ?? 'O';

    // Ch. 2.1.1: OibPrimateljaRacuna may only accompany a cash or card payment, and then
    // NacinPlac must not be 'T'. Sending both is a guaranteed rejection, so we simply do
    // not send the recipient OIB on a bank-transfer invoice.
    const recipientOib =
      invoice.recipientOib && paymentMethod !== 'T' ? invoice.recipientOib : null;

    const xml = buildRacunZahtjev({
      messageId: crypto.randomUUID(), // must be new on every attempt, including retries
      messageDatetime: new Date(),
      oib,
      inVatSystem: invoice.vatApplicable,
      issueDatetime: issued,
      sequenceMark: invoice.sequenceMark,
      sequenceNumber: invoice.seq,
      premiseCode: invoice.premiseCode,
      deviceCode: invoice.deviceCode,
      vatLines: invoice.vatLines,
      totalAmount: invoice.total,
      paymentMethod,
      operatorOib: invoice.operatorOib,
      zki,
      lateDelivery: Boolean(invoice.lateDelivery),
      recipientOib,
    });

    let body: string;
    try {
      body = wrapSoap(signRacunZahtjev(xml, cert));
    } catch (err) {
      return {
        status: 'failed',
        zki,
        retryable: false,
        error: `Poruku nije moguće potpisati: ${err instanceof Error ? err.message : 'nepoznata greška'}`,
      };
    }

    const url = environment === 'prod' ? env.fiscalProdUrl : env.fiscalTestUrl;

    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      text = await res.text();
    } catch (err) {
      // No answer at all: the invoice still stands, it just has no JIR yet. This is the
      // "naknadna dostava" path and it is always worth retrying.
      return {
        status: 'failed',
        zki,
        retryable: true,
        error: `Porezna uprava nije dostupna: ${err instanceof Error ? err.message : 'greška veze'}`,
      };
    }

    const jir = extract(text, 'Jir');
    if (jir) return { status: 'confirmed', jir, zki, retryable: false };

    const code = extract(text, 'SifraGreske');
    const message = extract(text, 'PorukaGreske') ?? extract(text, 'Poruka');

    if (code) {
      return {
        status: 'failed',
        zki,
        retryable: !PERMANENT_ERRORS.has(code),
        error: `${code}: ${message ?? describeError(code)}`,
      };
    }

    // HTTP-level problem, or a body we do not recognise.
    return {
      status: 'failed',
      zki,
      retryable: res.status >= 500 || res.status === 408 || res.status === 429,
      error: `Neočekivan odgovor Porezne uprave (HTTP ${res.status}).`,
    };
  }
}

function parseSqlDatetime(value: string): Date {
  // MySQL hands us 'YYYY-MM-DD HH:mm:ss' (dateStrings). Parse it as LOCAL time — the
  // fiscal timestamp is the wall-clock moment the invoice was issued, not UTC.
  const [d, t = '00:00:00'] = String(value).split(/[ T]/);
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0, ss || 0);
}

function extract(xml: string, localName: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${localName}>([^<]*)</(?:\\w+:)?${localName}>`).exec(xml);
  return m ? m[1].trim() || null : null;
}

const ERROR_TEXT: Record<string, string> = {
  s001: 'Poruka nije u skladu s XML shemom.',
  s002: 'Certifikat nije izdan od pružatelja usluga povjerenja s pouzdanog popisa ili je istekao.',
  s003: 'Certifikat ne sadrži obvezan podatak.',
  s004: 'Neispravan digitalni potpis.',
  s005: 'OIB iz poruke nije jednak OIB-u iz certifikata.',
  s006: 'Sistemska pogreška prilikom obrade zahtjeva.',
};

function describeError(code: string): string {
  return ERROR_TEXT[code] ?? 'Nepoznata greška.';
}
