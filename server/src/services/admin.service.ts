import { pool } from '../db/pool';
import { audit } from './audit.service';

// ---- Platform overview ------------------------------------------------------

export async function getPlatformStats() {
  const [[s]] = await pool.query<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM tenants) AS tenants,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM invoices WHERE status='issued' AND doc_type='invoice') AS invoices,
       (SELECT COALESCE(SUM(total),0) FROM invoices WHERE status='issued' AND doc_type='invoice') AS revenue,
       (SELECT COUNT(*) FROM invoices WHERE fiscal_status='confirmed') AS fiscalized,
       (SELECT COUNT(*) FROM invoices WHERE fiscal_status='pending') AS pending_fiscal,
       (SELECT COUNT(*) FROM invoices WHERE fiscal_status='failed') AS failed_fiscal,
       (SELECT COUNT(*) FROM users WHERE last_login_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS active_7d`,
  );
  const num = (v: any) => Number(v);
  return {
    tenants: num(s.tenants),
    users: num(s.users),
    invoices: num(s.invoices),
    revenue: num(s.revenue),
    fiscalized: num(s.fiscalized),
    pending_fiscal: num(s.pending_fiscal),
    failed_fiscal: num(s.failed_fiscal),
    active_7d: num(s.active_7d),
  };
}

export async function listTenants() {
  const [rows] = await pool.query<any[]>(
    `SELECT t.id, t.name, t.created_at,
            u.email AS owner_email, u.full_name AS owner_name, u.last_login_at,
            bp.type, bp.vat_status,
            (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id=t.id AND i.status='issued' AND i.doc_type='invoice') AS invoice_count,
            (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.tenant_id=t.id AND i.status='issued' AND i.doc_type='invoice') AS revenue,
            (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id=t.id AND i.fiscal_status='pending') AS pending_fiscal
     FROM tenants t
     JOIN users u ON u.tenant_id = t.id AND u.tenant_role = 'owner'
     LEFT JOIN business_profiles bp ON bp.tenant_id = t.id
     ORDER BY t.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    owner_email: r.owner_email,
    owner_name: r.owner_name,
    last_login_at: r.last_login_at,
    type: r.type,
    vat_status: r.vat_status,
    invoice_count: Number(r.invoice_count),
    revenue: Number(r.revenue),
    pending_fiscal: Number(r.pending_fiscal),
  }));
}

export async function getTenantDetail(tenantId: number) {
  const [[tenant]] = await pool.query<any[]>(
    `SELECT t.id, t.name, t.created_at, u.email AS owner_email, u.full_name AS owner_name,
            u.last_login_at, bp.type, bp.oib, bp.city, bp.vat_status, bp.uses_foreign_platforms, bp.has_vat_id
     FROM tenants t
     JOIN users u ON u.tenant_id = t.id AND u.tenant_role = 'owner'
     LEFT JOIN business_profiles bp ON bp.tenant_id = t.id
     WHERE t.id = ? LIMIT 1`,
    [tenantId],
  );
  if (!tenant) return null;

  const [[inv]] = await pool.query<any[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(status='issued' AND doc_type='invoice') AS issued,
       SUM(status='cancelled') AS cancelled,
       SUM(fiscal_status='pending') AS pending_fiscal,
       SUM(fiscal_status='failed') AS failed_fiscal,
       COALESCE(SUM(CASE WHEN status='issued' AND doc_type='invoice' THEN total ELSE 0 END),0) AS revenue
     FROM invoices WHERE tenant_id = ?`,
    [tenantId],
  );

  const [audits] = await pool.query<any[]>(
    `SELECT a.action, a.entity, a.entity_id, a.created_at, u.full_name AS user_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 25`,
    [tenantId],
  );

  return {
    ...tenant,
    invoices: {
      total: Number(inv.total),
      issued: Number(inv.issued ?? 0),
      cancelled: Number(inv.cancelled ?? 0),
      pending_fiscal: Number(inv.pending_fiscal ?? 0),
      failed_fiscal: Number(inv.failed_fiscal ?? 0),
      revenue: Number(inv.revenue),
    },
    recent_activity: audits,
  };
}

export async function getSystemHealth() {
  const [fiscalRows] = await pool.query<any[]>(
    `SELECT status, COUNT(*) AS c FROM fiscal_requests GROUP BY status`,
  );
  const fiscal: Record<string, number> = {};
  for (const r of fiscalRows) fiscal[r.status] = Number(r.c);

  const [failed] = await pool.query<any[]>(
    `SELECT fr.invoice_id, fr.attempts, fr.last_error, fr.updated_at, i.number_full, i.tenant_id
     FROM fiscal_requests fr JOIN invoices i ON i.id = fr.invoice_id
     WHERE fr.status IN ('failed','pending') ORDER BY fr.updated_at DESC LIMIT 15`,
  );

  const [[notif]] = await pool.query<any[]>(`SELECT COUNT(*) AS c FROM notifications`);

  return {
    fiscal_requests: fiscal,
    problem_requests: failed,
    notifications_total: Number(notif.c),
  };
}

export async function getPlatformAudit(limit = 50) {
  const [rows] = await pool.query<any[]>(
    `SELECT a.action, a.entity, a.entity_id, a.meta, a.created_at,
            u.full_name AS user_name, t.name AS tenant_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN tenants t ON t.id = a.tenant_id
     ORDER BY a.created_at DESC LIMIT ?`,
    [limit],
  );
  return rows;
}

// ---- Platform settings ------------------------------------------------------

export async function getPlatformSettings() {
  const [rows] = await pool.query<any[]>(
    `SELECT setting_key, setting_value, description, updated_at FROM platform_settings ORDER BY setting_key`,
  );
  return rows;
}

export async function updatePlatformSetting(key: string, value: string, userId: number) {
  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
     VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [key, value, userId],
  );
  await audit({ userId, action: 'admin.setting_update', entity: 'platform_settings', entityId: key, meta: { value } });
}

// ---- Effective-dated tax rates ---------------------------------------------

export async function listTaxRates() {
  const [rows] = await pool.query<any[]>(
    `SELECT id, category, label, rate, valid_from, valid_to, created_at
     FROM tax_rates ORDER BY category ASC, valid_from DESC`,
  );
  return rows;
}

// Adds a rate effective from a date. The previously-open rate for that category
// is closed the day before, so exactly one rate is active per period. Invoices
// freeze the rate effective on their issue date (resolveVatRate), so this change
// flows automatically to new invoices from valid_from onward.
export async function addTaxRate(
  category: string,
  label: string,
  rate: number,
  validFrom: string,
  userId: number,
) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE tax_rates SET valid_to = DATE_SUB(?, INTERVAL 1 DAY)
       WHERE category = ? AND valid_to IS NULL AND valid_from < ?`,
      [validFrom, category, validFrom],
    );
    await conn.query(
      `INSERT INTO tax_rates (category, label, rate, valid_from) VALUES (?, ?, ?, ?)`,
      [category, label, rate, validFrom],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  await audit({ userId, action: 'admin.tax_rate_add', entity: 'tax_rates', meta: { category, rate, valid_from: validFrom } });
}

// ---- JLS (municipalities) ---------------------------------------------------

export async function listMunicipalitiesAdmin() {
  const [rows] = await pool.query<any[]>(
    `SELECT id, name, county, flat_tax_per_bed_eur, tourist_tax_high_eur, tourist_tax_low_eur, active
     FROM municipalities ORDER BY name ASC`,
  );
  return rows;
}

export async function updateMunicipality(
  id: number,
  data: { flat_tax_per_bed_eur: number | null; tourist_tax_high_eur: number | null; tourist_tax_low_eur: number | null },
  userId: number,
) {
  await pool.query(
    `UPDATE municipalities SET flat_tax_per_bed_eur = ?, tourist_tax_high_eur = ?, tourist_tax_low_eur = ? WHERE id = ?`,
    [data.flat_tax_per_bed_eur, data.tourist_tax_high_eur, data.tourist_tax_low_eur, id],
  );
  await audit({ userId, action: 'admin.municipality_update', entity: 'municipalities', entityId: id, meta: data });
}
