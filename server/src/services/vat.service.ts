import { pool } from '../db/pool';
import { audit } from './audit.service';
import type { VatStatus } from '../types';

// The VAT status effective on a given date, derived from the transition
// history. This is what invoice issuing freezes — so invoices before a
// transition date carry no VAT and invoices on/after it do.
export async function resolveVatStatusOnDate(tenantId: number, onDate: string): Promise<VatStatus> {
  const [[change]] = await pool.query<any[]>(
    `SELECT to_status FROM vat_status_changes
     WHERE tenant_id = ? AND effective_date <= ?
     ORDER BY effective_date DESC, id DESC LIMIT 1`,
    [tenantId, onDate],
  );
  if (change) return change.to_status as VatStatus;
  // No transition applies on/before this date -> default outside the VAT system.
  return 'nije_obveznik';
}

export interface PendingVatChange {
  to_status: VatStatus;
  effective_date: string;
  reason: string | null;
}

// A transition whose effective date is still in the future (profile.vat_status
// not yet flipped) — surfaced so the UI can show "postajete obveznik od…".
export async function getPendingVatChange(tenantId: number): Promise<PendingVatChange | null> {
  const [[row]] = await pool.query<any[]>(
    `SELECT to_status, effective_date, reason FROM vat_status_changes
     WHERE tenant_id = ? AND effective_date > CURDATE()
     ORDER BY effective_date ASC LIMIT 1`,
    [tenantId],
  );
  return row ?? null;
}

// Records a status transition. If it takes effect today or earlier, the
// profile's cached vat_status is flipped immediately; future-dated changes are
// applied by the daily scheduler (and resolved correctly at issue time anyway).
export async function changeVatStatus(
  tenantId: number,
  userId: number,
  toStatus: VatStatus,
  effectiveDate: string,
  reason: string | null,
): Promise<void> {
  const [[profile]] = await pool.query<any[]>(
    `SELECT vat_status FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  const fromStatus = profile?.vat_status ?? 'nije_obveznik';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO vat_status_changes (tenant_id, from_status, to_status, effective_date, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, fromStatus, toStatus, effectiveDate, reason, userId],
    );
    // Flip the cached status now only if the change is already effective.
    await conn.query(
      `UPDATE business_profiles SET vat_status = ? WHERE tenant_id = ? AND ? <= CURDATE()`,
      [toStatus, tenantId, effectiveDate],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await audit({
    tenantId,
    userId,
    action: 'vat.status_change',
    entity: 'business_profile',
    meta: { from: fromStatus, to: toStatus, effective_date: effectiveDate },
  });
}

// Applies any future-dated transitions whose date has arrived (called daily).
export async function applyDueVatChanges(): Promise<number> {
  const [rows] = await pool.query<any[]>(
    `SELECT c.tenant_id, c.to_status
     FROM vat_status_changes c
     JOIN (
       SELECT tenant_id, MAX(effective_date) AS d
       FROM vat_status_changes WHERE effective_date <= CURDATE()
       GROUP BY tenant_id
     ) latest ON latest.tenant_id = c.tenant_id AND latest.d = c.effective_date
     JOIN business_profiles p ON p.tenant_id = c.tenant_id
     WHERE p.vat_status <> c.to_status`,
  );
  for (const r of rows) {
    await pool.query(`UPDATE business_profiles SET vat_status = ? WHERE tenant_id = ?`, [
      r.to_status,
      r.tenant_id,
    ]);
  }
  return rows.length;
}
