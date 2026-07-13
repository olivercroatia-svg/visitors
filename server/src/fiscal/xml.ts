import { formatAmount, formatXmlDatetime } from './zki';

// Builds the RacunZahtjev message (Tehnička specifikacija v2.7, ch. 2.1).
// Attribute/element order follows the XSD — the tax authority validates against the schema
// and answers s001 if the order is wrong, so this is not free-form.

export const FISKAL_NS = 'http://www.apis-it.hr/fin/2012/types/f73';

/** The root carries Id="RacunZahtjev" because the signature's Reference URI points at it. */
export const RACUN_ROOT_ID = 'RacunZahtjev';

export type PaymentMethod = 'G' | 'K' | 'T' | 'O';

export interface TaxLine {
  rate: number;
  base: number;
  amount: number;
}

export interface RacunData {
  messageId: string; // UUID, must differ on every resend
  messageDatetime: Date;
  oib: string;
  inVatSystem: boolean;
  issueDatetime: Date;
  /** 'P' = numbering per premise, 'N' = per device. */
  sequenceMark: 'P' | 'N';
  sequenceNumber: number;
  premiseCode: string;
  deviceCode: string;
  vatLines: TaxLine[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  operatorOib: string;
  zki: string;
  /** true when the invoice was issued to the customer without a JIR and is being sent late. */
  lateDelivery: boolean;
  /** B2B only, and only when paid in cash or by card (see the guard in fina.provider). */
  recipientOib?: string | null;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function esc(v: string): string {
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

const el = (name: string, value: string | number): string =>
  `<tns:${name}>${esc(String(value))}</tns:${name}>`;

export function buildRacunZahtjev(d: RacunData): string {
  const parts: string[] = [];

  parts.push(`<tns:Zaglavlje>`);
  parts.push(el('IdPoruke', d.messageId));
  parts.push(el('DatumVrijeme', formatXmlDatetime(d.messageDatetime)));
  parts.push(`</tns:Zaglavlje>`);

  parts.push(`<tns:Racun>`);
  parts.push(el('Oib', d.oib));
  parts.push(el('USustPdv', d.inVatSystem ? 'true' : 'false'));
  parts.push(el('DatVrijeme', formatXmlDatetime(d.issueDatetime)));
  parts.push(el('OznSlijed', d.sequenceMark));
  parts.push(
    `<tns:BrRac>${el('BrOznRac', d.sequenceNumber)}${el('OznPosPr', d.premiseCode)}${el(
      'OznNapUr',
      d.deviceCode,
    )}</tns:BrRac>`,
  );

  // Pdv is omitted entirely for a non-VAT taxpayer — the spec sends it only when the
  // invoice actually carries VAT, and an empty <Pdv/> fails schema validation.
  if (d.vatLines.length > 0) {
    const porezi = d.vatLines
      .map(
        (t) =>
          `<tns:Porez>${el('Stopa', formatAmount(t.rate))}${el(
            'Osnovica',
            formatAmount(t.base),
          )}${el('Iznos', formatAmount(t.amount))}</tns:Porez>`,
      )
      .join('');
    parts.push(`<tns:Pdv>${porezi}</tns:Pdv>`);
  }

  parts.push(el('IznosUkupno', formatAmount(d.totalAmount)));
  parts.push(el('NacinPlac', d.paymentMethod));
  parts.push(el('OibOper', d.operatorOib));
  parts.push(el('ZastKod', d.zki));
  parts.push(el('NakDost', d.lateDelivery ? 'true' : 'false'));
  if (d.recipientOib) parts.push(el('OibPrimateljaRacuna', d.recipientOib));
  parts.push(`</tns:Racun>`);

  return (
    `<tns:RacunZahtjev Id="${RACUN_ROOT_ID}" xmlns:tns="${FISKAL_NS}" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    parts.join('') +
    `</tns:RacunZahtjev>`
  );
}

export function wrapSoap(signedBody: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body>${signedBody}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}
