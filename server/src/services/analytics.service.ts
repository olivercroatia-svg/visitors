import { pool } from '../db/pool';

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  premiseId?: number;
  paymentMethod?: string;
}

export function parseFilters(query: any): AnalyticsFilters {
  const f: AnalyticsFilters = {};
  if (typeof query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) f.from = query.from;
  if (typeof query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) f.to = query.to;
  if (query.premise_id && Number(query.premise_id) > 0) f.premiseId = Number(query.premise_id);
  if (typeof query.payment_method === 'string' && query.payment_method !== 'all')
    f.paymentMethod = query.payment_method;
  return f;
}

// Shared WHERE for every aggregation. Base set = issued, non-storno invoices
// (clean net revenue). Alias `i` for invoices.
function buildWhere(tenantId: number, f: AnalyticsFilters): { clause: string; params: any[] } {
  const params: any[] = [tenantId];
  let clause = `i.tenant_id = ? AND i.doc_type = 'invoice' AND i.status = 'issued'`;
  if (f.from) {
    clause += ' AND i.issue_date >= ?';
    params.push(f.from);
  }
  if (f.to) {
    clause += ' AND i.issue_date <= ?';
    params.push(f.to);
  }
  if (f.premiseId) {
    clause += ' AND i.premise_id = ?';
    params.push(f.premiseId);
  }
  if (f.paymentMethod) {
    clause += ' AND i.payment_method = ?';
    params.push(f.paymentMethod);
  }
  return { clause, params };
}

export async function getAnalytics(tenantId: number, f: AnalyticsFilters) {
  const { clause, params } = buildWhere(tenantId, f);

  const [[kpi]] = await pool.query<any[]>(
    `SELECT
       COALESCE(SUM(i.total),0) AS revenue,
       COUNT(*) AS invoice_count,
       COALESCE(AVG(i.total),0) AS avg_value,
       COUNT(DISTINCT i.guest_id) AS unique_guests,
       COALESCE(SUM(CASE WHEN i.payment_method='gotovina' THEN i.total ELSE 0 END),0) AS cash_total,
       COALESCE(SUM(CASE WHEN i.payment_method<>'gotovina' THEN i.total ELSE 0 END),0) AS cashless_total
     FROM invoices i WHERE ${clause}`,
    params,
  );

  const [[nights]] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(it.quantity),0) AS total_nights
     FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id
     WHERE ${clause} AND it.unit = 'noć'`,
    params,
  );

  const [byMonth] = await pool.query<any[]>(
    `SELECT DATE_FORMAT(i.issue_date,'%Y-%m') AS month, COALESCE(SUM(i.total),0) AS revenue, COUNT(*) AS count
     FROM invoices i WHERE ${clause} GROUP BY month ORDER BY month ASC`,
    params,
  );

  const [byPremise] = await pool.query<any[]>(
    `SELECT p.name AS premise, p.code, COALESCE(SUM(i.total),0) AS revenue, COUNT(*) AS count
     FROM invoices i JOIN premises p ON p.id = i.premise_id AND p.tenant_id = i.tenant_id
     WHERE ${clause} GROUP BY i.premise_id ORDER BY revenue DESC`,
    params,
  );

  const [byPayment] = await pool.query<any[]>(
    `SELECT i.payment_method AS method, COALESCE(SUM(i.total),0) AS revenue, COUNT(*) AS count
     FROM invoices i WHERE ${clause} GROUP BY i.payment_method ORDER BY revenue DESC`,
    params,
  );

  const [byCategory] = await pool.query<any[]>(
    `SELECT it.vat_category AS category, COALESCE(SUM(it.line_total),0) AS revenue
     FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id
     WHERE ${clause} GROUP BY it.vat_category ORDER BY revenue DESC`,
    params,
  );

  const [topGuests] = await pool.query<any[]>(
    `SELECT
       COALESCE(i.guest_name_cache, NULLIF(TRIM(CONCAT(COALESCE(g.first_name,''),' ',COALESCE(g.last_name,''))),''), 'Krajnji potrošač') AS guest,
       COALESCE(SUM(i.total),0) AS revenue,
       COUNT(*) AS count
     FROM invoices i LEFT JOIN guests g ON g.id = i.guest_id AND g.tenant_id = i.tenant_id
     WHERE ${clause}
     GROUP BY guest ORDER BY revenue DESC LIMIT 10`,
    params,
  );

  const [byCountry] = await pool.query<any[]>(
    `SELECT COALESCE(g.country,'Nepoznato') AS country, COUNT(*) AS count, COALESCE(SUM(i.total),0) AS revenue
     FROM invoices i JOIN guests g ON g.id = i.guest_id AND g.tenant_id = i.tenant_id
     WHERE ${clause} GROUP BY country ORDER BY count DESC LIMIT 8`,
    params,
  );

  const num = (v: any) => Number(v);
  return {
    kpis: {
      revenue: num(kpi.revenue),
      invoice_count: num(kpi.invoice_count),
      avg_value: num(kpi.avg_value),
      unique_guests: num(kpi.unique_guests),
      cash_total: num(kpi.cash_total),
      cashless_total: num(kpi.cashless_total),
      total_nights: num(nights.total_nights),
    },
    by_month: byMonth.map((r) => ({ month: r.month, revenue: num(r.revenue), count: num(r.count) })),
    by_premise: byPremise.map((r) => ({ premise: r.premise, code: r.code, revenue: num(r.revenue), count: num(r.count) })),
    by_payment: byPayment.map((r) => ({ method: r.method, revenue: num(r.revenue), count: num(r.count) })),
    by_category: byCategory.map((r) => ({ category: r.category, revenue: num(r.revenue) })),
    top_guests: topGuests.map((r) => ({ guest: r.guest, revenue: num(r.revenue), count: num(r.count) })),
    by_country: byCountry.map((r) => ({ country: r.country, count: num(r.count), revenue: num(r.revenue) })),
  };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

// Detailed rows for CSV/XLSX export — same filter set as the aggregations.
export async function getFilteredInvoiceRows(tenantId: number, f: AnalyticsFilters) {
  const { clause, params } = buildWhere(tenantId, f);
  const [rows] = await pool.query<any[]>(
    `SELECT i.number_full, i.issue_date, i.guest_name_cache, p.code AS premise_code,
            i.payment_method, i.vat_applicable, i.subtotal, i.vat_total, i.total,
            CASE WHEN i.fiscal_status='confirmed' THEN i.jir ELSE '' END AS jir
     FROM invoices i LEFT JOIN premises p ON p.id = i.premise_id AND p.tenant_id = i.tenant_id
     WHERE ${clause} ORDER BY i.issue_datetime ASC`,
    params,
  );
  return rows;
}
