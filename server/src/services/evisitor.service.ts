import { env } from '../config/env';
import { pool } from '../db/pool';
import { getEVisitorProvider } from '../evisitor';
import { CODEBOOK_KINDS, CODEBOOK_RESOURCES, fallbackCodebook } from '../evisitor/codebooks';
import type {
  CodebookEntry,
  CodebookKind,
  EVisitorCheckIn,
  EVisitorCheckOut,
  EVisitorCredentials,
  EVisitorMessage,
  EVisitorOperation,
  EVisitorResult,
  Gender,
} from '../evisitor/types';
import { hasErrors, validateCheckIn, validateCheckOut } from '../evisitor/validation';
import type { StayValidationInput } from '../evisitor/validation';
import { decryptSecret, encryptSecret, KEY_VERSION } from '../utils/crypto';

// Orchestrates everything between our tables and the eVisitor provider: credentials,
// the outbound queue, the retry drain, the codebook cache and the system-message log.

export class EVisitorError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_ATTEMPTS = 12;

// ---- Credentials ------------------------------------------------------------

export interface CredentialsView {
  configured: boolean;
  username: string | null;
  environment: 'test' | 'prod';
  base_url: string | null;
  last_verified_at: string | null;
  last_error: string | null;
}

export async function getCredentialsView(tenantId: number): Promise<CredentialsView> {
  const [[row]] = await pool.query<any[]>(
    `SELECT username, environment, base_url, last_verified_at, last_error
     FROM evisitor_credentials WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (!row) {
    return {
      configured: false,
      username: null,
      environment: 'test',
      base_url: null,
      last_verified_at: null,
      last_error: null,
    };
  }
  // The password and apikey never leave the server, not even as ciphertext.
  return { configured: true, ...row };
}

export async function saveCredentials(
  tenantId: number,
  input: { username: string; password?: string | null; apikey?: string | null; environment: 'test' | 'prod' },
): Promise<void> {
  const [[existing]] = await pool.query<any[]>(
    `SELECT id FROM evisitor_credentials WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );

  if (!existing && !input.password) {
    throw new EVisitorError(422, 'Unesite lozinku za eVisitor.');
  }

  const pw = input.password ? encryptSecret(input.password) : null;
  // An empty apikey means "clear it"; an absent one means "leave it as it is".
  const ak = input.apikey ? encryptSecret(input.apikey) : null;
  const clearApikey = input.apikey === '';

  if (!existing) {
    await pool.query(
      `INSERT INTO evisitor_credentials
         (tenant_id, username, password_ct, password_iv, password_tag,
          apikey_ct, apikey_iv, apikey_tag, key_version, environment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, input.username, pw!.ct, pw!.iv, pw!.tag,
        ak?.ct ?? null, ak?.iv ?? null, ak?.tag ?? null, KEY_VERSION, input.environment,
      ],
    );
    return;
  }

  const sets = ['username = ?', 'environment = ?', 'last_error = NULL'];
  const params: any[] = [input.username, input.environment];

  if (pw) {
    sets.push('password_ct = ?', 'password_iv = ?', 'password_tag = ?', 'key_version = ?');
    params.push(pw.ct, pw.iv, pw.tag, KEY_VERSION);
  }
  if (ak) {
    sets.push('apikey_ct = ?', 'apikey_iv = ?', 'apikey_tag = ?');
    params.push(ak.ct, ak.iv, ak.tag);
  } else if (clearApikey) {
    sets.push('apikey_ct = NULL', 'apikey_iv = NULL', 'apikey_tag = NULL');
  }

  params.push(tenantId);
  await pool.query(`UPDATE evisitor_credentials SET ${sets.join(', ')} WHERE tenant_id = ?`, params);
}

export async function deleteCredentials(tenantId: number): Promise<void> {
  await pool.query(`DELETE FROM evisitor_credentials WHERE tenant_id = ?`, [tenantId]);
}

async function loadCredentials(tenantId: number): Promise<EVisitorCredentials | null> {
  const [[row]] = await pool.query<any[]>(
    `SELECT * FROM evisitor_credentials WHERE tenant_id = ? AND active = 1 LIMIT 1`,
    [tenantId],
  );
  if (!row) return null;

  const baseUrl =
    row.base_url ?? (row.environment === 'prod' ? env.evisitorProdUrl : env.evisitorTestUrl);

  return {
    username: row.username,
    password: decryptSecret(row.password_ct, row.password_iv, row.password_tag),
    apikey: row.apikey_ct ? decryptSecret(row.apikey_ct, row.apikey_iv, row.apikey_tag) : null,
    baseUrl,
  };
}

function requireCredentials(creds: EVisitorCredentials | null): EVisitorCredentials {
  if (!creds) {
    throw new EVisitorError(
      422,
      'Niste unijeli eVisitor pristupne podatke. Unesite ih u Postavke → eVisitor.',
    );
  }
  return creds;
}

export async function verifyCredentials(tenantId: number): Promise<EVisitorResult> {
  const creds = requireCredentials(await loadCredentials(tenantId));
  const result = await getEVisitorProvider().verifyCredentials(creds);

  if (result.status === 'confirmed') {
    await pool.query(
      `UPDATE evisitor_credentials SET last_verified_at = NOW(), last_error = NULL WHERE tenant_id = ?`,
      [tenantId],
    );
  } else {
    await pool.query(`UPDATE evisitor_credentials SET last_error = ? WHERE tenant_id = ?`, [
      truncate(result.error ?? 'Neuspjela prijava.'),
      tenantId,
    ]);
  }
  return result;
}

// ---- Codebooks --------------------------------------------------------------

export async function getCodebook(kind: CodebookKind): Promise<(CodebookEntry & { synced: boolean })[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT code, label, parent_code, meta FROM evisitor_codebooks
     WHERE kind = ? AND active = 1 ORDER BY label ASC`,
    [kind],
  );
  if (rows.length > 0) {
    return rows.map((r) => ({
      code: r.code,
      label: r.label,
      parentCode: r.parent_code,
      meta: r.meta,
      synced: true,
    }));
  }
  // Nothing synced yet — serve what we know and let the UI say it is provisional.
  return fallbackCodebook(kind).map((e) => ({ ...e, synced: false }));
}

export async function syncCodebooks(tenantId: number): Promise<Record<string, number>> {
  const creds = requireCredentials(await loadCredentials(tenantId));
  const provider = getEVisitorProvider();
  const counts: Record<string, number> = {};

  for (const kind of CODEBOOK_KINDS) {
    if (!CODEBOOK_RESOURCES[kind]) continue;
    try {
      const entries = await provider.fetchCodebook(creds, kind);
      for (const e of entries) {
        await pool.query(
          `INSERT INTO evisitor_codebooks (kind, code, label, parent_code, meta, active, synced_at)
           VALUES (?, ?, ?, ?, ?, 1, NOW())
           ON DUPLICATE KEY UPDATE label = VALUES(label), parent_code = VALUES(parent_code),
                                   meta = VALUES(meta), active = 1, synced_at = NOW()`,
          [kind, e.code, e.label, e.parentCode ?? null, e.meta ? JSON.stringify(e.meta) : null],
        );
      }
      counts[kind] = entries.length;
    } catch (err) {
      // One unreachable codebook must not abort the rest of the sync.
      counts[kind] = 0;
      console.error(`[evisitor] codebook sync failed for ${kind}`, err);
    }
  }
  return counts;
}

export async function importFacilities(tenantId: number): Promise<number> {
  const creds = requireCredentials(await loadCredentials(tenantId));
  const facilities = await getEVisitorProvider().fetchFacilities(creds);

  let imported = 0;
  for (const f of facilities) {
    const [res] = await pool.query<any>(
      `INSERT INTO accommodation_objects (tenant_id, name, facility_code)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), active = 1`,
      [tenantId, f.name, f.facilityCode],
    );
    if (res.affectedRows > 0) imported++;
  }
  return imported;
}

// ---- System messages (ch. 4.4.6) --------------------------------------------

async function recordMessages(
  tenantId: number,
  stayId: number | null,
  operation: EVisitorOperation,
  messages: EVisitorMessage[],
  raw?: string,
): Promise<void> {
  for (const m of messages) {
    await pool.query(
      `INSERT INTO evisitor_messages (tenant_id, stay_id, operation, severity, message, raw)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, stayId, operation, m.severity, m.text.slice(0, 1000), raw ?? null],
    );
  }
}

export async function listMessages(tenantId: number, onlyOpen: boolean) {
  const [rows] = await pool.query<any[]>(
    `SELECT m.id, m.stay_id, m.operation, m.severity, m.message, m.acknowledged_at, m.created_at,
            CONCAT(g.first_name, ' ', g.last_name) AS guest_name
     FROM evisitor_messages m
     LEFT JOIN stays s ON s.id = m.stay_id
     LEFT JOIN guests g ON g.id = s.guest_id
     WHERE m.tenant_id = ? ${onlyOpen ? 'AND m.acknowledged_at IS NULL' : ''}
     ORDER BY m.created_at DESC LIMIT 200`,
    [tenantId],
  );
  return rows;
}

export async function acknowledgeMessage(tenantId: number, userId: number, id: number): Promise<boolean> {
  const [res] = await pool.query<any>(
    `UPDATE evisitor_messages SET acknowledged_at = NOW(), acknowledged_by = ?
     WHERE id = ? AND tenant_id = ? AND acknowledged_at IS NULL`,
    [userId, id, tenantId],
  );
  return res.affectedRows > 0;
}

// ---- Dispatch + queue -------------------------------------------------------

interface StayRow {
  id: number;
  tenant_id: number;
  evisitor_id: string | null;
  check_in_at: string;
  foreseen_check_out_at: string;
  check_out_at: string | null;
  tt_category: string;
  arrival_org: string;
  service_type: string;
  note: string | null;
  facility_code: string;
  object_active: number;
  [key: string]: any;
}

const STAY_SELECT = `
  SELECT s.*, o.facility_code, o.active AS object_active,
         g.first_name, g.middle_name, g.last_name, g.date_of_birth, g.gender,
         g.citizenship_code, g.birth_country_code, g.birth_city,
         g.residence_country_code, g.residence_city, g.residence_address,
         g.doc_type_code, g.doc_number, g.email, g.phone,
         g.visa_type, g.visa_number, g.visa_validity_date
  FROM stays s
  JOIN accommodation_objects o ON o.id = s.object_id
  JOIN guests g ON g.id = s.guest_id`;

export async function loadStayForDispatch(tenantId: number, stayId: number): Promise<StayRow | null> {
  const [[row]] = await pool.query<any[]>(
    `${STAY_SELECT} WHERE s.id = ? AND s.tenant_id = ? LIMIT 1`,
    [stayId, tenantId],
  );
  return row ?? null;
}

export function toValidationInput(row: StayRow): StayValidationInput {
  return {
    facilityCode: row.facility_code,
    objectActive: Boolean(row.object_active),
    checkInAt: row.check_in_at,
    foreseenCheckOutAt: row.foreseen_check_out_at,
    checkOutAt: row.check_out_at,
    ttCategory: row.tt_category,
    arrivalOrg: row.arrival_org,
    serviceType: row.service_type,
    guest: {
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      docTypeCode: row.doc_type_code,
      docNumber: row.doc_number,
      citizenshipCode: row.citizenship_code,
      birthCountryCode: row.birth_country_code,
      birthCity: row.birth_city,
      residenceCountryCode: row.residence_country_code,
      residenceCity: row.residence_city,
      phone: row.phone,
    },
  };
}

function toCheckInPayload(row: StayRow, attempt: number, isEdit: boolean): EVisitorCheckIn {
  const [inDate, inTime] = splitDateTime(row.check_in_at);
  const [outDate, outTime] = splitDateTime(row.foreseen_check_out_at);
  return {
    id: row.evisitor_id!,
    facility: row.facility_code,
    stayFrom: inDate,
    timeStayFrom: inTime,
    foreseenStayUntil: outDate,
    timeEstimatedStayUntil: outTime,
    documentType: row.doc_type_code,
    documentNumber: row.doc_number,
    touristName: row.first_name,
    touristMiddleName: row.middle_name,
    touristSurname: row.last_name,
    gender: row.gender as Gender,
    countryOfBirth: row.birth_country_code,
    cityOfBirth: row.birth_city,
    citizenship: row.citizenship_code,
    countryOfResidence: row.residence_country_code,
    cityOfResidence: row.residence_city,
    residenceAddress: row.residence_address,
    ttPaymentCategory: row.tt_category,
    arrivalOrganisation: row.arrival_org,
    offeredServiceType: row.service_type,
    dateOfBirth: row.date_of_birth,
    touristEmail: row.email,
    touristTelephone: row.phone,
    visaType: row.visa_type,
    visaNumber: row.visa_number,
    visaValidityDate: row.visa_validity_date,
    isEdit,
    attempt,
    note: row.note,
  };
}

function toCheckOutPayload(row: StayRow, attempt: number): EVisitorCheckOut {
  const [date, time] = splitDateTime(row.check_out_at!);
  return { id: row.evisitor_id!, checkOutDate: date, checkOutTime: time, attempt, note: row.note };
}

function splitDateTime(value: string): [string, string] {
  const s = String(value);
  return [s.slice(0, 10), s.slice(11, 16) || '00:00'];
}

// Enqueue and immediately attempt. Callers run this AFTER their DB commit, so a stay that
// eVisitor cannot accept right now still exists on our side as `pending` — the same
// guarantee issueInvoice() gives a numbered-but-unfiscalized invoice.
export async function dispatchStay(
  tenantId: number,
  stayId: number,
  operation: EVisitorOperation,
): Promise<EVisitorResult> {
  const revision = await nextRevision(stayId, operation);
  const idem = `${operation}-${stayId}-${revision}`;

  await pool.query(
    `INSERT INTO evisitor_requests (tenant_id, stay_id, operation, status, attempts, idempotency_key, deadline_at)
     VALUES (?, ?, ?, 'pending', 1, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
     ON DUPLICATE KEY UPDATE attempts = attempts + 1, status = 'pending', next_attempt_at = NULL`,
    [tenantId, stayId, operation, idem],
  );

  const [[req]] = await pool.query<any[]>(
    `SELECT id, attempts FROM evisitor_requests WHERE idempotency_key = ?`,
    [idem],
  );
  return runRequest(tenantId, stayId, operation, idem, Number(req?.attempts ?? 1));
}

// A stay can legitimately be edited or checked out more than once, so the idempotency key
// carries a revision. The check-in key stays stable (revision 0) — that is what makes a
// retry re-send the SAME GUID instead of creating a second prijava.
async function nextRevision(stayId: number, operation: EVisitorOperation): Promise<number> {
  if (operation === 'checkin') return 0;
  const [[row]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS n FROM evisitor_requests WHERE stay_id = ? AND operation = ? AND status <> 'pending'`,
    [stayId, operation],
  );
  return Number(row?.n ?? 0);
}

async function runRequest(
  tenantId: number,
  stayId: number,
  operation: EVisitorOperation,
  idem: string,
  attempt: number,
): Promise<EVisitorResult> {
  const creds = await loadCredentials(tenantId);
  if (!creds) {
    const message = 'Niste unijeli eVisitor pristupne podatke. Unesite ih u Postavke → eVisitor.';
    await markFailed(tenantId, stayId, operation, idem, message, [{ severity: 'error', text: message }]);
    return { status: 'failed', retryable: false, error: message, messages: [] };
  }

  const row = await loadStayForDispatch(tenantId, stayId);
  if (!row) {
    return { status: 'failed', retryable: false, error: 'Boravak nije pronađen.', messages: [] };
  }

  // Re-validate at dispatch: the guest may have been edited after the request was queued.
  const input = toValidationInput(row);
  const issues = operation === 'checkout' ? validateCheckOut(input) : validateCheckIn(input);
  if (hasErrors(issues)) {
    const message = issues.find((i) => i.severity === 'error')!.message;
    await markFailed(
      tenantId, stayId, operation, idem, message,
      issues.filter((i) => i.severity === 'error').map((i) => ({ severity: 'error' as const, text: i.message })),
    );
    return { status: 'failed', retryable: false, error: message, messages: [] };
  }

  const provider = getEVisitorProvider();
  let result: EVisitorResult;

  switch (operation) {
    case 'checkin':
      result = await provider.checkIn(creds, [toCheckInPayload(row, attempt, false)]);
      break;
    case 'edit':
      result = await provider.checkIn(creds, [toCheckInPayload(row, attempt, true)]);
      break;
    case 'checkout':
      result = await provider.checkOut(creds, [toCheckOutPayload(row, attempt)]);
      break;
    case 'cancel':
      result = await provider.cancel(creds, row.evisitor_id!);
      break;
  }

  await recordMessages(tenantId, stayId, operation, result.messages, result.raw);

  if (result.status === 'confirmed') {
    await markConfirmed(tenantId, stayId, operation, idem);
  } else if (result.retryable && attempt < MAX_ATTEMPTS) {
    await markPending(stayId, idem, result.error ?? 'Nepoznata greška.', attempt);
  } else {
    await markFailed(tenantId, stayId, operation, idem, result.error ?? 'Nepoznata greška.', []);
  }

  return result;
}

async function markConfirmed(
  tenantId: number,
  stayId: number,
  operation: EVisitorOperation,
  idem: string,
): Promise<void> {
  await pool.query(
    `UPDATE evisitor_requests SET status = 'confirmed', last_error = NULL WHERE idempotency_key = ?`,
    [idem],
  );

  // The business status only advances once eVisitor has actually accepted the operation.
  const sets: Record<EVisitorOperation, string> = {
    checkin: `status = 'checked_in', evisitor_status = 'confirmed', registered_at = NOW(), last_error = NULL`,
    edit: `evisitor_status = 'confirmed', last_error = NULL`,
    checkout: `status = 'checked_out', evisitor_status = 'confirmed', checked_out_at = NOW(), last_error = NULL`,
    cancel: `status = 'cancelled', evisitor_status = 'confirmed', cancelled_at = NOW(), last_error = NULL`,
  };

  await pool.query(`UPDATE stays SET ${sets[operation]} WHERE id = ? AND tenant_id = ?`, [
    stayId,
    tenantId,
  ]);
}

async function markPending(
  stayId: number,
  idem: string,
  error: string,
  attempt: number,
): Promise<void> {
  // Exponential backoff, capped at an hour: 2, 4, 8 … 60 minutes.
  const minutes = Math.min(Math.pow(2, attempt), 60);
  await pool.query(
    `UPDATE evisitor_requests
     SET status = 'pending', last_error = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE idempotency_key = ?`,
    [truncate(error), minutes, idem],
  );
  await pool.query(`UPDATE stays SET evisitor_status = 'pending', last_error = ? WHERE id = ?`, [
    truncate(error),
    stayId,
  ]);
}

async function markFailed(
  tenantId: number,
  stayId: number,
  operation: EVisitorOperation,
  idem: string,
  error: string,
  messages: EVisitorMessage[],
): Promise<void> {
  await pool.query(
    `UPDATE evisitor_requests SET status = 'failed', last_error = ? WHERE idempotency_key = ?`,
    [truncate(error), idem],
  );
  await pool.query(`UPDATE stays SET evisitor_status = 'failed', last_error = ? WHERE id = ?`, [
    truncate(error),
    stayId,
  ]);
  if (messages.length > 0) await recordMessages(tenantId, stayId, operation, messages);
}

// ---- Retry drain (scheduler) ------------------------------------------------

export async function drainEVisitorQueue(): Promise<number> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, stay_id, operation, idempotency_key, attempts
     FROM evisitor_requests
     WHERE status = 'pending'
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
       AND attempts < ?
     ORDER BY tenant_id, id
     LIMIT 100`,
    [MAX_ATTEMPTS],
  );

  let processed = 0;
  for (const r of rows) {
    try {
      await pool.query(`UPDATE evisitor_requests SET attempts = attempts + 1 WHERE id = ?`, [r.id]);
      await runRequest(
        r.tenant_id,
        r.stay_id,
        r.operation as EVisitorOperation,
        r.idempotency_key,
        Number(r.attempts) + 1,
      );
      processed++;
    } catch (err) {
      console.error(`[evisitor] drain failed for request ${r.id}`, err);
    }
  }

  await flagOverdue();
  return processed;
}

// Past the 24h legal window and still not through — the landlord has to know.
async function flagOverdue(): Promise<void> {
  const [rows] = await pool.query<any[]>(
    `SELECT r.tenant_id, r.stay_id, CONCAT(g.first_name, ' ', g.last_name) AS guest_name
     FROM evisitor_requests r
     JOIN stays s ON s.id = r.stay_id
     JOIN guests g ON g.id = s.guest_id
     WHERE r.status IN ('pending','failed') AND r.deadline_at IS NOT NULL AND r.deadline_at < NOW()
     LIMIT 50`,
  );

  for (const r of rows) {
    await pool.query(
      `INSERT INTO notifications (tenant_id, severity, category, title, body, link, dedupe_key)
       VALUES (?, 'danger', 'evisitor', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title)`,
      [
        r.tenant_id,
        'eVisitor prijava nije prošla',
        `Prijava gosta ${r.guest_name} nije zaprimljena u eVisitoru unutar 24 sata. Otvorite boravak i provjerite poruku sustava.`,
        `/boravci/${r.stay_id}`,
        `evisitor-overdue-${r.stay_id}`,
      ],
    );
  }
}

function truncate(text: string, max = 500): string {
  return text.length > max ? text.slice(0, max) : text;
}
