import { pool } from '../db/pool';

interface AuditEntry {
  tenantId?: number | null;
  userId?: number | null;
  action: string;
  entity?: string | null;
  entityId?: string | number | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

// Append-only audit trail. Never throws into the request path — a failed
// audit write must not break the user action, only get logged.
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity, entity_id, meta, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.tenantId ?? null,
        entry.userId ?? null,
        entry.action,
        entry.entity ?? null,
        entry.entityId != null ? String(entry.entityId) : null,
        entry.meta ? JSON.stringify(entry.meta) : null,
        entry.ip ?? null,
      ],
    );
  } catch (err) {
    console.error('[audit] failed to write entry', entry.action, err);
  }
}
