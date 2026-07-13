import { TT_CATEGORY_AGE_RULES } from './codebooks';

// Every business rule from ch. 4 of the HTZ integration guide lives here, and both the
// route and the queue worker run it. Duplicating it in the client would let the two
// drift; catching a bad record here instead of at eVisitor also means the landlord gets
// a useful Croatian message instead of a rejected transfer.

export interface Issue {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning'; // only 'error' blocks the send
}

export interface StayValidationInput {
  facilityCode: string | null;
  objectActive: boolean;
  checkInAt: string; // 'YYYY-MM-DD HH:mm:ss'
  foreseenCheckOutAt: string;
  checkOutAt?: string | null;
  ttCategory: string | null;
  arrivalOrg: string | null;
  serviceType: string | null;
  guest: {
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null; // 'YYYY-MM-DD'
    gender: string | null;
    docTypeCode: string | null;
    docNumber: string | null;
    citizenshipCode: string | null;
    birthCountryCode: string | null;
    birthCity: string | null;
    residenceCountryCode: string | null;
    residenceCity: string | null;
    phone?: string | null;
  };
}

const MAX_STAY_DAYS = 90; // MUP limit (ch. 4.4.4)
const MAX_AGE_YEARS = 120;

// MUP field maxima (ch. 4.4.4). The DB columns are wider on purpose — they also hold
// billing data that predates eVisitor — so the limit is enforced here, on this path only.
const MAX = { docNumber: 16, name: 64, surname: 64, city: 64 };

function parse(dt: string | null | undefined): Date | null {
  if (!dt) return null;
  // MySQL returns 'YYYY-MM-DD HH:mm:ss' (dateStrings); make it unambiguous for Date.
  const d = new Date(dt.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageAt(dob: string, at: Date): number {
  const b = new Date(dob.slice(0, 10) + 'T00:00:00');
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
  return age;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function req(
  issues: Issue[],
  value: unknown,
  field: string,
  message: string,
): void {
  if (value === null || value === undefined || String(value).trim() === '') {
    issues.push({ field, code: 'required', message, severity: 'error' });
  }
}

function maxLen(issues: Issue[], value: string | null | undefined, limit: number, field: string, label: string): void {
  if (value && value.trim().length > limit) {
    issues.push({
      field,
      code: 'max_length',
      message: `${label} smije imati najviše ${limit} znakova (eVisitor/MUP ograničenje).`,
      severity: 'error',
    });
  }
}

export function validateCheckIn(input: StayValidationInput): Issue[] {
  const issues: Issue[] = [];
  const g = input.guest;

  // Ch. 4.2 — mandatory fields.
  req(issues, input.facilityCode, 'object', 'Odaberite smještajni objekt.');
  req(issues, input.checkInAt, 'check_in_at', 'Unesite datum i vrijeme dolaska.');
  req(issues, input.foreseenCheckOutAt, 'foreseen_check_out_at', 'Unesite predviđeni datum i vrijeme odlaska.');
  req(issues, input.ttCategory, 'tt_category', 'Odaberite kategoriju obveznika boravišne pristojbe.');
  req(issues, input.arrivalOrg, 'arrival_org', 'Odaberite organizaciju dolaska.');
  req(issues, input.serviceType, 'service_type', 'Odaberite vrstu usluge.');
  req(issues, g.firstName, 'guest.first_name', 'Unesite ime gosta.');
  req(issues, g.lastName, 'guest.last_name', 'Unesite prezime gosta.');
  req(issues, g.gender, 'guest.gender', 'Odaberite spol gosta.');
  req(issues, g.dateOfBirth, 'guest.date_of_birth', 'Unesite datum rođenja gosta.');
  req(issues, g.docTypeCode, 'guest.doc_type_code', 'Odaberite vrstu identifikacijskog dokumenta.');
  req(issues, g.docNumber, 'guest.doc_number', 'Unesite broj identifikacijskog dokumenta.');
  req(issues, g.citizenshipCode, 'guest.citizenship_code', 'Odaberite državljanstvo gosta.');
  req(issues, g.birthCountryCode, 'guest.birth_country_code', 'Odaberite državu rođenja gosta.');
  req(issues, g.residenceCountryCode, 'guest.residence_country_code', 'Odaberite državu prebivališta gosta.');
  req(issues, g.residenceCity, 'guest.residence_city', 'Unesite grad prebivališta gosta.');

  // Ch. 4.4.5 — cannot check in to a deactivated object.
  if (!input.objectActive) {
    issues.push({
      field: 'object',
      code: 'object_inactive',
      message: 'Ne možete prijaviti turista u deaktivirani objekt.',
      severity: 'error',
    });
  }

  maxLen(issues, g.docNumber, MAX.docNumber, 'guest.doc_number', 'Broj dokumenta');
  maxLen(issues, g.firstName, MAX.name, 'guest.first_name', 'Ime turista');
  maxLen(issues, g.lastName, MAX.surname, 'guest.last_name', 'Prezime turista');
  maxLen(issues, g.birthCity, MAX.city, 'guest.birth_city', 'Naziv grada rođenja');
  maxLen(issues, g.residenceCity, MAX.city, 'guest.residence_city', 'Naziv grada prebivališta');

  const from = parse(input.checkInAt);
  const until = parse(input.foreseenCheckOutAt);
  const now = new Date();

  // Ch. 4.4.3 — date sanity.
  if (from && until) {
    if (until.getTime() < from.getTime()) {
      issues.push({
        field: 'foreseen_check_out_at',
        code: 'checkout_before_checkin',
        message: 'Datum odlaska ne smije biti prije datuma dolaska.',
        severity: 'error',
      });
    } else if (until.getTime() - from.getTime() > MAX_STAY_DAYS * DAY_MS) {
      issues.push({
        field: 'foreseen_check_out_at',
        code: 'max_stay',
        message: 'Prekoračen je maksimalan broj dana boravka turista (90 dana).',
        severity: 'error',
      });
    }
  }

  if (g.dateOfBirth && from) {
    const dob = parse(g.dateOfBirth);
    if (dob && dob.getTime() >= now.getTime()) {
      issues.push({
        field: 'guest.date_of_birth',
        code: 'dob_future',
        message: 'Datum rođenja mora biti manji od današnjeg datuma.',
        severity: 'error',
      });
    }

    const age = ageAt(g.dateOfBirth, from);
    if (age > MAX_AGE_YEARS) {
      issues.push({
        field: 'guest.date_of_birth',
        code: 'dob_range',
        message: 'Datum rođenja nije unutar dozvoljenog raspona.',
        severity: 'error',
      });
    }

    // Ch. 4.4.5.5/6 — eVisitor only warns about these, so we warn too rather than block.
    if (age > 90) {
      issues.push({
        field: 'guest.date_of_birth',
        code: 'dob_old',
        message: 'Gost je stariji od 90 godina — provjerite datum rođenja.',
        severity: 'warning',
      });
    }
    const dobDate = parse(g.dateOfBirth);
    if (dobDate && from.getTime() - dobDate.getTime() < 10 * DAY_MS) {
      issues.push({
        field: 'guest.date_of_birth',
        code: 'dob_infant',
        message: 'Gost je mlađi od 10 dana — provjerite datum rođenja.',
        severity: 'warning',
      });
    }

    // Ch. 4.3 — the BP category must be legal for the guest's age.
    const rule = input.ttCategory ? TT_CATEGORY_AGE_RULES[input.ttCategory] : undefined;
    if (rule) {
      const tooOld = rule.maxAge !== undefined && age > rule.maxAge;
      const tooYoung = rule.minAge !== undefined && age < rule.minAge;
      if (tooOld || tooYoung) {
        issues.push({
          field: 'tt_category',
          code: 'tt_category_age',
          message: `Odabrana kategorija boravišne pristojbe nije dozvoljena za dob gosta (${age} god.).`,
          severity: 'error',
        });
      }
    }
  }

  // Ch. 4.4.5.2 — phone must be in international form if given.
  if (g.phone && g.phone.trim() !== '' && !/^\+\d{6,15}$/.test(g.phone.trim())) {
    issues.push({
      field: 'guest.phone',
      code: 'phone_format',
      message: 'Telefon nije u ispravnom formatu. Ispravan format je +385999999999.',
      severity: 'warning',
    });
  }

  return issues;
}

export function validateCheckOut(input: StayValidationInput): Issue[] {
  const issues: Issue[] = [];
  const out = parse(input.checkOutAt);
  const from = parse(input.checkInAt);
  const now = new Date();

  if (!out) {
    issues.push({
      field: 'check_out_at',
      code: 'required',
      message: 'Unesite datum i vrijeme odjave.',
      severity: 'error',
    });
    return issues;
  }

  if (from && out.getTime() < from.getTime()) {
    issues.push({
      field: 'check_out_at',
      code: 'checkout_before_checkin',
      message: 'Upisano vrijeme odjave je manje od vremena dolaska.',
      severity: 'error',
    });
  }

  if (out.getTime() > now.getTime()) {
    issues.push({
      field: 'check_out_at',
      code: 'checkout_future',
      message: 'Datum odjave turista ne smije biti veći od današnjeg datuma.',
      severity: 'error',
    });
  }

  // Ch. 4.4.3.3 — eVisitor expects the check-out within 24h of the guest leaving. We warn
  // rather than block: refusing to record a late check-out would leave the stay open in
  // eVisitor, which is strictly worse than sending it late.
  if (out.getTime() < now.getTime() - DAY_MS) {
    issues.push({
      field: 'check_out_at',
      code: 'checkout_late',
      message:
        'Odjava se unosi više od 24 sata nakon odlaska gosta — eVisitor je može odbiti. Ako ne prođe, javite se svojoj turističkoj zajednici.',
      severity: 'warning',
    });
  }

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
