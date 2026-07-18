import bwipjs from 'bwip-js';

// HUB-3 payment barcode (PDF417) per the Croatian Banking Association spec
// "Format zapisa 2D barkoda prema HUB-3 standardu", v6 (EUR edition, Sept 2022):
// 14 LF-terminated UTF-8 fields, clipped to per-field maximums, never padded —
// except Iznos, which is right-aligned and zero-padded to 15 digits (eurocents).

interface Hub3Profile {
  legal_name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  iban: string | null;
}

// The spec whitelists digits, Croatian letters (incl. QWXY), space and , . : - + ? ' / ( )
const DISALLOWED = /[^0-9A-Za-zČčĆćĐđŠšŽž ,.:\-+?'/()]/g;

function clip(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(DISALLOWED, '')
    .trim()
    .slice(0, max);
}

// Builds the 14-field payload, or null when a payment barcode makes no sense:
// non-transakcijski payment, storno/zero amounts, or no usable HR IBAN.
export function buildHub3Payload(invoice: any, profile: Hub3Profile): string | null {
  if (invoice.payment_method !== 'transakcijski') return null;
  if ((invoice.currency ?? 'EUR') !== 'EUR') return null;

  const cents = Math.round(Number(invoice.total) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || String(cents).length > 15) return null;

  const iban = String(profile.iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^HR\d{19}$/.test(iban)) return null;

  // Reference from the invoice number (7/PP1/1 → 7-1-1). HR00 requires purely
  // numeric hyphen-separated groups; anything else falls back to HR99 (no reference).
  const reference = String(invoice.number_full ?? '').replace(/\//g, '-');
  const validReference = /^\d{1,12}(-\d{1,12}){0,2}$/.test(reference);

  // The buyer on a company invoice is the company; otherwise the guest.
  const payerName = invoice.company_name_cache || invoice.guest_name_cache || '';
  const payerStreet = invoice.company_name_cache ? invoice.company_address_cache : invoice.guest_address;
  const payerPlace = invoice.company_name_cache
    ? [invoice.company_postal_code_cache, invoice.company_city_cache].filter(Boolean).join(' ')
    : invoice.guest_city;

  const fields = [
    'HRVHUB30',
    'EUR',
    String(cents).padStart(15, '0'),
    clip(payerName, 30),
    clip(payerStreet, 27),
    clip(payerPlace, 27),
    clip(profile.legal_name, 25),
    clip(profile.address, 25),
    clip(`${profile.postal_code ?? ''} ${profile.city ?? ''}`, 27),
    iban,
    validReference ? 'HR00' : 'HR99',
    validReference ? clip(reference, 22) : '',
    '',
    clip(`Račun br. ${invoice.number_full ?? ''}`, 35),
  ];
  return fields.join('\n') + '\n';
}

// PDF417 per the spec: 9 data columns, error correction level 4, 3:1 module
// ratio (bwip-js default rowmult), regular (non-compact, non-Macro) symbol.
// columns/eclevel are BWIPP passthrough options absent from bwip-js typings.
export async function renderHub3Png(payload: string): Promise<Buffer> {
  const opts = {
    bcid: 'pdf417',
    text: payload,
    columns: 9,
    eclevel: 4,
    scale: 3,
  } as Parameters<typeof bwipjs.toBuffer>[0];
  return bwipjs.toBuffer(opts);
}
