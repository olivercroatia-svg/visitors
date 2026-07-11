import { pool } from '../db/pool';
import { getComplianceOverview } from './compliance.service';

interface NewNotification {
  severity: 'info' | 'warning' | 'danger';
  category: string;
  title: string;
  body: string;
  link?: string;
  dedupe_key: string;
}

async function upsert(tenantId: number, n: NewNotification): Promise<void> {
  // INSERT IGNORE on the (tenant_id, dedupe_key) unique key -> one notification
  // per distinct situation, never spammed on repeat runs.
  await pool.query(
    `INSERT INTO notifications (tenant_id, severity, category, title, body, link, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [tenantId, n.severity, n.category, n.title, n.body, n.link ?? null, n.dedupe_key],
  );
}

// Derives in-app reminders from the compliance snapshot. (Push/email delivery
// channels plug in here later; keys/creds not available in dev.)
export async function generateForTenant(tenantId: number): Promise<number> {
  const c = await getComplianceOverview(tenantId);
  const year = new Date().getUTCFullYear();
  const before = await unreadCount(tenantId);

  if (c.threshold.warn_level > 0) {
    const danger = c.threshold.pct >= 95;
    await upsert(tenantId, {
      severity: danger ? 'danger' : 'warning',
      category: 'threshold',
      title: 'Prag PDV-a',
      body: `Godišnji promet je na ${c.threshold.pct}% praga. ${
        c.threshold.projected_cross_date ? 'Ovim tempom prelazite prag ove godine.' : ''
      }`.trim(),
      link: '/obveze',
      dedupe_key: `threshold-${c.threshold.warn_level}-${year}`,
    });
  }

  if (c.reverse_charge.warning) {
    await upsert(tenantId, {
      severity: 'danger',
      category: 'reverse-charge',
      title: 'Provizije stranim platformama',
      body: 'Vjerojatno trebate PDV ID broj i obračun PDV-a na proviziju (Booking/Airbnb).',
      link: '/obveze',
      dedupe_key: `reverse-charge-${year}`,
    });
  }

  for (const o of c.obligations) {
    if (o.days_until >= 0 && o.days_until <= 14) {
      await upsert(tenantId, {
        severity: o.days_until <= 3 ? 'danger' : 'warning',
        category: 'deadline',
        title: `Rok: ${o.title}`,
        body: `${o.description} Rok za ${o.days_until} ${o.days_until === 1 ? 'dan' : 'dana'}.`,
        link: '/obveze',
        dedupe_key: `obligation-${o.key}`,
      });
    }
  }

  return (await unreadCount(tenantId)) - before;
}

export async function generateForAllTenants(): Promise<void> {
  const [tenants] = await pool.query<any[]>(`SELECT id FROM tenants`);
  for (const t of tenants) {
    try {
      await generateForTenant(t.id);
    } catch (err) {
      console.error('[notifications] generate failed for tenant', t.id, err);
    }
  }
}

export async function listNotifications(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT id, severity, category, title, body, link, is_read, created_at
     FROM notifications WHERE tenant_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 100`,
    [tenantId],
  );
  return rows;
}

export async function unreadCount(tenantId: number): Promise<number> {
  const [[row]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c FROM notifications WHERE tenant_id = ? AND is_read = 0`,
    [tenantId],
  );
  return Number(row.c);
}

export async function markRead(tenantId: number, id?: number): Promise<void> {
  if (id) {
    await pool.query(`UPDATE notifications SET is_read = 1 WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
  } else {
    await pool.query(`UPDATE notifications SET is_read = 1 WHERE tenant_id = ?`, [tenantId]);
  }
}
