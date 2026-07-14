import crypto from 'crypto';
import { pool } from '../db/pool';
import type { Issue } from '../evisitor/validation';
import { hasErrors, validateCheckIn, validateCheckOut } from '../evisitor/validation';
import { ownsGuest, ownsObject } from '../utils/ownership';
import {
  dispatchStay,
  EVisitorError,
  loadStayForDispatch,
  toValidationInput,
} from './evisitor.service';

// Stay lifecycle. Mirrors invoice.service.ts: state transitions are guarded inside a
// transaction with SELECT ... FOR UPDATE, and the call to the outside world happens only
// AFTER the commit.

export interface StayInput {
  object_id: number;
  guest_id: number;
  check_in_at: string;
  foreseen_check_out_at: string;
  tt_category: string;
  arrival_org: string;
  service_type: string;
  group_ref?: string | null;
  note?: string | null;
}

export async function listStays(
  tenantId: number,
  filters: { status?: string; object_id?: number; q?: string },
) {
  const params: any[] = [tenantId];
  let where = 's.tenant_id = ?';

  if (filters.status) {
    where += ' AND s.status = ?';
    params.push(filters.status);
  }
  if (filters.object_id) {
    where += ' AND s.object_id = ?';
    params.push(filters.object_id);
  }
  if (filters.q) {
    where += ' AND CONCAT(g.first_name, " ", g.last_name) LIKE ?';
    params.push(`%${filters.q}%`);
  }

  const [rows] = await pool.query<any[]>(
    `SELECT s.id, s.status, s.evisitor_status, s.evisitor_id, s.check_in_at, s.foreseen_check_out_at,
            s.check_out_at, s.tt_category, s.last_error, s.group_ref,
            CONCAT(g.first_name, ' ', g.last_name) AS guest_name, g.id AS guest_id,
            o.name AS object_name, o.id AS object_id
     FROM stays s
     JOIN guests g ON g.id = s.guest_id AND g.tenant_id = s.tenant_id
     JOIN accommodation_objects o ON o.id = s.object_id AND o.tenant_id = s.tenant_id
     WHERE ${where}
     ORDER BY s.check_in_at DESC, s.id DESC
     LIMIT 300`,
    params,
  );
  return rows;
}

export async function getStay(tenantId: number, stayId: number) {
  const [[stay]] = await pool.query<any[]>(
    `SELECT s.*, CONCAT(g.first_name, ' ', g.last_name) AS guest_name,
            o.name AS object_name, o.facility_code
     FROM stays s
     JOIN guests g ON g.id = s.guest_id AND g.tenant_id = s.tenant_id
     JOIN accommodation_objects o ON o.id = s.object_id AND o.tenant_id = s.tenant_id
     WHERE s.id = ? AND s.tenant_id = ? LIMIT 1`,
    [stayId, tenantId],
  );
  if (!stay) return null;

  const [messages] = await pool.query<any[]>(
    `SELECT id, severity, message, operation, acknowledged_at, created_at
     FROM evisitor_messages WHERE stay_id = ? AND tenant_id = ? ORDER BY created_at DESC`,
    [stayId, tenantId],
  );
  const [requests] = await pool.query<any[]>(
    `SELECT id, operation, status, attempts, last_error, next_attempt_at, created_at
     FROM evisitor_requests WHERE stay_id = ? AND tenant_id = ? ORDER BY id DESC`,
    [stayId, tenantId],
  );

  return { ...stay, messages, requests };
}

// Dry run for the check-in form — the client's inline errors and the server's gate are
// then literally the same rules.
export async function validateStayInput(tenantId: number, input: StayInput): Promise<Issue[]> {
  const [[object]] = await pool.query<any[]>(
    `SELECT facility_code, active FROM accommodation_objects WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [input.object_id, tenantId],
  );
  const [[guest]] = await pool.query<any[]>(
    `SELECT * FROM guests WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [input.guest_id, tenantId],
  );
  if (!object) throw new EVisitorError(404, 'Smještajni objekt nije pronađen.');
  if (!guest) throw new EVisitorError(404, 'Gost nije pronađen.');

  return validateCheckIn({
    facilityCode: object.facility_code,
    objectActive: Boolean(object.active),
    checkInAt: input.check_in_at,
    foreseenCheckOutAt: input.foreseen_check_out_at,
    checkOutAt: null,
    ttCategory: input.tt_category,
    arrivalOrg: input.arrival_org,
    serviceType: input.service_type,
    guest: {
      firstName: guest.first_name,
      lastName: guest.last_name,
      dateOfBirth: guest.date_of_birth,
      gender: guest.gender,
      docTypeCode: guest.doc_type_code,
      docNumber: guest.doc_number,
      citizenshipCode: guest.citizenship_code,
      birthCountryCode: guest.birth_country_code,
      birthCity: guest.birth_city,
      residenceCountryCode: guest.residence_country_code,
      residenceCity: guest.residence_city,
      phone: guest.phone,
    },
  });
}

// Ch. 1.3.2 / 4.4.1: eVisitor rejects the same person twice in the same object over an
// overlapping period. Catching it here saves a round-trip and gives a clearer message.
async function assertNoDuplicate(tenantId: number, input: StayInput, excludeStayId?: number): Promise<void> {
  const [[dup]] = await pool.query<any[]>(
    `SELECT s.id FROM stays s
     JOIN guests g ON g.id = s.guest_id
     JOIN guests ng ON ng.id = ?
     WHERE s.tenant_id = ? AND s.object_id = ?
       AND s.status IN ('checked_in','checked_out')
       AND (? IS NULL OR s.id <> ?)
       AND g.first_name = ng.first_name AND g.last_name = ng.last_name
       AND (g.date_of_birth <=> ng.date_of_birth)
       AND (g.doc_number <=> ng.doc_number)
       AND s.check_in_at < ? AND s.foreseen_check_out_at > ?
     LIMIT 1`,
    [
      input.guest_id, tenantId, input.object_id,
      excludeStayId ?? null, excludeStayId ?? 0,
      input.foreseen_check_out_at, input.check_in_at,
    ],
  );

  if (dup) {
    throw new EVisitorError(
      409,
      'Turist je već prijavljen u navedenom objektu ili dva puta prijavljujete istog turista.',
    );
  }
}

export async function createStay(
  tenantId: number,
  input: StayInput,
  register: boolean,
): Promise<number> {
  const issues = await validateStayInput(tenantId, input);
  if (register && hasErrors(issues)) {
    throw new EVisitorError(422, issues.find((i) => i.severity === 'error')!.message);
  }
  if (register) await assertNoDuplicate(tenantId, input);

  const [[guest]] = await pool.query<any[]>(
    `SELECT CONCAT(first_name, ' ', last_name) AS name FROM guests WHERE id = ? AND tenant_id = ?`,
    [input.guest_id, tenantId],
  );

  const [res] = await pool.query<any>(
    `INSERT INTO stays (tenant_id, object_id, guest_id, guest_name_cache, evisitor_id,
                        check_in_at, foreseen_check_out_at, tt_category, arrival_org, service_type,
                        status, evisitor_status, group_ref, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'none', ?, ?)`,
    [
      tenantId, input.object_id, input.guest_id, guest?.name ?? null,
      // The GUID is ours and is minted once, at creation. Re-sending it on a retry is what
      // makes the check-in idempotent instead of creating a second prijava.
      crypto.randomUUID().toUpperCase(),
      input.check_in_at, input.foreseen_check_out_at,
      input.tt_category, input.arrival_org, input.service_type,
      input.group_ref ?? null, input.note ?? null,
    ],
  );

  const stayId = Number(res.insertId);
  if (register) await dispatchStay(tenantId, stayId, 'checkin');
  return stayId;
}

async function lockStay(conn: any, tenantId: number, stayId: number) {
  const [[stay]] = await conn.query(
    `SELECT id, status, evisitor_status FROM stays WHERE id = ? AND tenant_id = ? FOR UPDATE`,
    [stayId, tenantId],
  );
  return stay;
}

export async function registerStay(tenantId: number, stayId: number): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const stay = await lockStay(conn, tenantId, stayId);
    if (!stay) throw new EVisitorError(404, 'Boravak nije pronađen.');
    if (stay.status === 'cancelled') throw new EVisitorError(409, 'Prijava je poništena.');
    if (stay.status === 'checked_out') throw new EVisitorError(409, 'Gost je već odjavljen.');
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const row = await loadStayForDispatch(tenantId, stayId);
  if (!row) throw new EVisitorError(404, 'Boravak nije pronađen.');
  const issues = validateCheckIn(toValidationInput(row));
  if (hasErrors(issues)) {
    throw new EVisitorError(422, issues.find((i) => i.severity === 'error')!.message);
  }

  await dispatchStay(tenantId, stayId, 'checkin');
}

export async function checkOutStay(
  tenantId: number,
  stayId: number,
  checkOutAt: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const stay = await lockStay(conn, tenantId, stayId);
    if (!stay) throw new EVisitorError(404, 'Boravak nije pronađen.');

    // Ch. 4.4.1.5/7 — a checked-out or cancelled prijava cannot be checked out again.
    if (stay.status === 'checked_out') throw new EVisitorError(409, 'Odjavljuje se ista prijava više puta.');
    if (stay.status === 'cancelled') throw new EVisitorError(409, 'Prijava je već odjavljena ili poništena.');
    if (stay.status === 'draft') throw new EVisitorError(409, 'Gost još nije prijavljen u eVisitor.');

    await conn.query(`UPDATE stays SET check_out_at = ? WHERE id = ? AND tenant_id = ?`, [
      checkOutAt,
      stayId,
      tenantId,
    ]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const row = await loadStayForDispatch(tenantId, stayId);
  const issues = validateCheckOut(toValidationInput(row!));
  if (hasErrors(issues)) {
    throw new EVisitorError(422, issues.find((i) => i.severity === 'error')!.message);
  }

  await dispatchStay(tenantId, stayId, 'checkout');
}

export async function updateStay(tenantId: number, stayId: number, input: StayInput): Promise<void> {
  const [[stay]] = await pool.query<any[]>(
    `SELECT status FROM stays WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [stayId, tenantId],
  );
  if (!stay) throw new EVisitorError(404, 'Boravak nije pronađen.');
  if (stay.status === 'checked_out') {
    throw new EVisitorError(409, 'Nije dopuštena izmjena odjavljenog turista. Javite se u TZ.');
  }
  if (stay.status === 'cancelled') {
    throw new EVisitorError(409, 'Prijava sa zadanim ID-jem je već poništena.');
  }

  // createStay gets this from validateStayInput; the edit path never had it, so a stay could
  // be re-pointed at another tenant's object or guest and read back through the joins.
  if (!(await ownsObject(tenantId, input.object_id))) {
    throw new EVisitorError(404, 'Smještajni objekt nije pronađen.');
  }
  if (!(await ownsGuest(tenantId, input.guest_id))) {
    throw new EVisitorError(404, 'Gost nije pronađen.');
  }

  await pool.query(
    `UPDATE stays SET object_id = ?, guest_id = ?, check_in_at = ?, foreseen_check_out_at = ?,
                      tt_category = ?, arrival_org = ?, service_type = ?, note = ?
     WHERE id = ? AND tenant_id = ?`,
    [
      input.object_id, input.guest_id, input.check_in_at, input.foreseen_check_out_at,
      input.tt_category, input.arrival_org, input.service_type, input.note ?? null,
      stayId, tenantId,
    ],
  );

  // Already registered in eVisitor -> the change has to be pushed as an edit.
  if (stay.status === 'checked_in') await dispatchStay(tenantId, stayId, 'edit');
}

export async function cancelStay(tenantId: number, stayId: number, reason: string): Promise<void> {
  const [[stay]] = await pool.query<any[]>(
    `SELECT status, evisitor_status FROM stays WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [stayId, tenantId],
  );
  if (!stay) throw new EVisitorError(404, 'Boravak nije pronađen.');
  if (stay.status === 'cancelled') throw new EVisitorError(409, 'Prijava je već poništena.');

  await pool.query(`UPDATE stays SET cancelled_reason = ? WHERE id = ? AND tenant_id = ?`, [
    reason,
    stayId,
    tenantId,
  ]);

  // A stay that never reached eVisitor is cancelled locally — there is nothing to undo there.
  if (stay.status === 'draft' || stay.evisitor_status === 'none') {
    await pool.query(
      `UPDATE stays SET status = 'cancelled', cancelled_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [stayId, tenantId],
    );
    return;
  }

  await dispatchStay(tenantId, stayId, 'cancel');
}

export async function retryStay(tenantId: number, stayId: number): Promise<void> {
  const [[req]] = await pool.query<any[]>(
    `SELECT operation FROM evisitor_requests
     WHERE stay_id = ? AND tenant_id = ? AND status IN ('pending','failed')
     ORDER BY id DESC LIMIT 1`,
    [stayId, tenantId],
  );
  if (!req) throw new EVisitorError(404, 'Nema zahtjeva za ponovno slanje.');
  await dispatchStay(tenantId, stayId, req.operation);
}
