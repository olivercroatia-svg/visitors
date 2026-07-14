// The Machine Readable Zone is the only part of a travel document that can verify itself.
// Every field the state cares about carries a check digit, so a correct read is provable
// arithmetic rather than "the model said so". That matters here: eVisitor forwards
// doc_number and date_of_birth to MUP, which rejects the whole stay on a single wrong
// character — and by then the stay row already exists.
//
// ICAO 9303: weights cycle 7-3-1, '<' is 0, digits are themselves, A..Z are 10..35.
// Supported layouts: TD3 (passport, 2x44) and TD1 (ID card, 3x30).

const WEIGHTS = [7, 3, 1];

function charValue(c: string): number {
  if (c === '<') return 0;
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55; // 'A' -> 10
  return -1; // anything else is not MRZ alphabet
}

function checkDigit(input: string): number | null {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const v = charValue(input[i]);
    if (v < 0) return null;
    sum += v * WEIGHTS[i % 3];
  }
  return sum % 10;
}

function digitMatches(field: string, expected: string): boolean {
  const computed = checkDigit(field);
  return computed !== null && String(computed) === expected;
}

/** '<' is MRZ filler, not data. */
function strip(s: string): string {
  return s.replace(/</g, '').trim();
}

// YYMMDD. A date of birth is always in the past, so a two-digit year above the current one
// must belong to the previous century. Expiry dates only ever run forward.
function toIsoDate(yymmdd: string, kind: 'birth' | 'expiry'): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;

  const currentYY = new Date().getFullYear() % 100;
  const year = kind === 'birth' ? (yy > currentYY ? 1900 + yy : 2000 + yy) : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

function toGender(c: string): 'muski' | 'zenski' | null {
  if (c === 'M') return 'muski';
  if (c === 'F') return 'zenski';
  return null; // '<' means unspecified
}

export interface MrzCheck {
  /** true only when every check digit present in the layout verifies. */
  ok: boolean;
  layout: 'TD1' | 'TD3';
  /** Which check digits failed — surfaced to the user so they know what to compare. */
  failed: string[];

  doc_number?: string;
  date_of_birth?: string;
  expiry_date?: string;
  citizenship_code?: string;
  gender?: 'muski' | 'zenski';
}

// Deliberately NOT extracted: names. The MRZ transliterates them to A-Z, so "ČAVIĆ"
// becomes "CAVIC". The visual read keeps the diacritics and is the better source.

function parseTd3(l1: string, l2: string): MrzCheck {
  const failed: string[] = [];

  const docNumber = l2.slice(0, 9);
  const docCheck = l2[9];
  const nationality = l2.slice(10, 13);
  const dob = l2.slice(13, 19);
  const dobCheck = l2[19];
  const sex = l2[20];
  const expiry = l2.slice(21, 27);
  const expiryCheck = l2[27];
  const optional = l2.slice(28, 42);
  const optionalCheck = l2[42];
  const compositeCheck = l2[43];

  if (!digitMatches(docNumber, docCheck)) failed.push('doc_number');
  if (!digitMatches(dob, dobCheck)) failed.push('date_of_birth');
  if (!digitMatches(expiry, expiryCheck)) failed.push('expiry_date');
  if (!digitMatches(optional, optionalCheck)) failed.push('optional_data');

  const composite = docNumber + docCheck + dob + dobCheck + expiry + expiryCheck + optional + optionalCheck;
  if (!digitMatches(composite, compositeCheck)) failed.push('composite');

  return {
    ok: failed.length === 0,
    layout: 'TD3',
    failed,
    doc_number: strip(docNumber) || undefined,
    date_of_birth: toIsoDate(dob, 'birth') ?? undefined,
    expiry_date: toIsoDate(expiry, 'expiry') ?? undefined,
    citizenship_code: strip(nationality) || undefined,
    gender: toGender(sex) ?? undefined,
  };
}

function parseTd1(l1: string, l2: string): MrzCheck {
  const failed: string[] = [];

  const docNumber = l1.slice(5, 14);
  const docCheck = l1[14];
  const dob = l2.slice(0, 6);
  const dobCheck = l2[6];
  const sex = l2[7];
  const expiry = l2.slice(8, 14);
  const expiryCheck = l2[14];
  const nationality = l2.slice(15, 18);
  const compositeCheck = l2[29];

  if (!digitMatches(docNumber, docCheck)) failed.push('doc_number');
  if (!digitMatches(dob, dobCheck)) failed.push('date_of_birth');
  if (!digitMatches(expiry, expiryCheck)) failed.push('expiry_date');

  // ICAO 9303-5: upper line 6..30, middle line 1..7, 9..15, 19..29 (1-indexed).
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  if (!digitMatches(composite, compositeCheck)) failed.push('composite');

  return {
    ok: failed.length === 0,
    layout: 'TD1',
    failed,
    doc_number: strip(docNumber) || undefined,
    date_of_birth: toIsoDate(dob, 'birth') ?? undefined,
    expiry_date: toIsoDate(expiry, 'expiry') ?? undefined,
    citizenship_code: strip(nationality) || undefined,
    gender: toGender(sex) ?? undefined,
  };
}

/**
 * Verify raw MRZ lines. Returns null when the input is not a recognisable MRZ at all
 * (wrong line count or length) — that is "no MRZ on the photo", not "MRZ is wrong".
 * A returned object with ok=false means the MRZ was read but does not add up.
 */
export function verifyMrz(lines: string[] | null | undefined): MrzCheck | null {
  if (!lines || lines.length < 2) return null;

  // Normalise: the model may return lowercase, spaces, or padded lines.
  const norm = lines
    .map((l) => l.toUpperCase().replace(/\s+/g, ''))
    .filter((l) => l.length > 0);

  if (norm.length === 2 && norm[0].length === 44 && norm[1].length === 44) {
    return parseTd3(norm[0], norm[1]);
  }
  if (norm.length === 3 && norm.every((l) => l.length === 30)) {
    return parseTd1(norm[0], norm[1]);
  }
  return null;
}
