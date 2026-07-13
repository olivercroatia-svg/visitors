import crypto from 'crypto';
import type { KeyObject } from 'crypto';

// ZKI (zaštitni kod izdavatelja) — Tehnička specifikacija v2.7, ch. 12.
//
// Concatenate six fields with NO separators, sign the result with RSA-SHA256 using the
// taxpayer's advanced certificate, then MD5 the signature bytes and print it as 32
// lowercase hex characters.
//
// The MD5 at the end is not a security choice we get to second-guess: it exists to
// squeeze the signature down to 32 characters that fit on a printed receipt, and the
// tax authority recomputes exactly this. Changing it to SHA-256 would produce a ZKI the
// authority rejects.

export interface ZkiInput {
  oib: string;
  /** Real issue moment. Formatted 'dd.MM.yyyy HH:mm:ss' — note the SPACE. */
  issueDatetime: Date;
  /** Brojčana oznaka računa — the sequence number alone, no leading zeros. */
  sequenceNumber: number;
  /** Oznaka poslovnog prostora (premise code). */
  premiseCode: string;
  /** Oznaka naplatnog uređaja (device code). */
  deviceCode: string;
  /** Ukupni iznos — decimal POINT, two decimals, e.g. "1245.56". Negative for storno. */
  total: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

// ZKI wants 'dd.MM.gggg HH:mm:ss' with a space. The XML message wants the SAME instant as
// 'dd.MM.ggggTHH:mm:ss' with a T. Two formats, one timestamp — an easy and expensive
// mistake, so they live side by side here.
export function formatZkiDatetime(d: Date): string {
  return (
    `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function formatXmlDatetime(d: Date): string {
  return (
    `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function formatAmount(n: number): string {
  return Number(n).toFixed(2);
}

/** The exact string that gets signed. Exported so it can be inspected when a ZKI is disputed. */
export function buildZkiPayload(input: ZkiInput): string {
  return [
    input.oib,
    formatZkiDatetime(input.issueDatetime),
    String(input.sequenceNumber), // no leading zeros
    input.premiseCode,
    input.deviceCode,
    formatAmount(input.total),
  ].join('');
}

export function computeZki(input: ZkiInput, privateKey: KeyObject): string {
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(buildZkiPayload(input), 'utf8')
    .sign(privateKey);

  return crypto.createHash('md5').update(signature).digest('hex');
}
