import QRCode from 'qrcode';
import { pool } from '../db/pool';
import { audit } from './audit.service';
import { computeTotals, VAT_EXEMPTION_CLAUSE, type LineInput, type DiscountType } from './pricing.service';
import { getOnboardingStatus } from './onboarding.service';
import { resolveVatStatusOnDate } from './vat.service';
import { getFiscalProvider, type FiscalInvoice } from '../fiscal';

export interface DraftInput {
  premise_id: number;
  device_id: number;
  guest_id?: number | null;
  guest_name?: string | null;
  company_id?: number | null;
  due_date?: string | null;
  payment_method: 'gotovina' | 'kartica' | 'transakcijski' | 'ostalo';
  note?: string | null;
  // Whole-invoice discount. Mutually exclusive with per-line discounts (enforced
  // in the route); allocated pro-rata into the lines by computeTotals.
  discount_type?: DiscountType;
  discount_value?: number;
  items: LineInput[];
}

export class InvoiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---- Reads ------------------------------------------------------------------

export async function getInvoiceFull(tenantId: number, id: number) {
  const [[invoice]] = await pool.query<any[]>(
    `SELECT i.*, g.first_name AS guest_first, g.last_name AS guest_last, g.address AS guest_address,
            g.city AS guest_city, g.country AS guest_country,
            p.name AS premise_name, p.code AS premise_code,
            d.code AS device_code
     FROM invoices i
     LEFT JOIN guests g ON g.id = i.guest_id
     LEFT JOIN premises p ON p.id = i.premise_id
     LEFT JOIN devices d ON d.id = i.device_id
     WHERE i.id = ? AND i.tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  if (!invoice) return null;
  const [items] = await pool.query<any[]>(
    `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC`,
    [id],
  );
  let cancelledBy = null;
  if (invoice.cancelled_by_invoice_id) {
    const [[c]] = await pool.query<any[]>(
      `SELECT id, number_full, jir FROM invoices WHERE id = ? AND tenant_id = ?`,
      [invoice.cancelled_by_invoice_id, tenantId],
    );
    cancelledBy = c ?? null;
  }
  const qr = buildQr(invoice);
  const qr_data_url = qr ? await QRCode.toDataURL(qr, { margin: 1, width: 220 }) : null;
  return { ...invoice, items, cancelled_by: cancelledBy, qr, qr_data_url };
}

export interface InvoiceFilters {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listInvoices(tenantId: number, filters: InvoiceFilters) {
  const params: any[] = [tenantId];
  let where = 'i.tenant_id = ?';
  if (filters.status && filters.status !== 'all') {
    where += ' AND i.status = ?';
    params.push(filters.status);
  }
  if (filters.from) {
    where += ' AND i.issue_date >= ?';
    params.push(filters.from);
  }
  if (filters.to) {
    where += ' AND i.issue_date <= ?';
    params.push(filters.to);
  }
  if (filters.q) {
    where += ' AND (i.number_full LIKE ? OR i.guest_name_cache LIKE ?)';
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  const limit = Math.min(filters.limit ?? 100, 500);
  const [rows] = await pool.query<any[]>(
    `SELECT i.id, i.doc_type, i.number_full, i.status, i.issue_date, i.total, i.currency,
            i.fiscal_status, i.jir, i.guest_name_cache, i.payment_method
     FROM invoices i
     WHERE ${where}
     ORDER BY (i.status='draft') DESC, i.issue_datetime DESC, i.created_at DESC
     LIMIT ${limit}`,
    params,
  );
  return rows;
}

// ---- Draft ------------------------------------------------------------------

export async function createDraft(tenantId: number, userId: number, input: DraftInput) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Copy the buyer company onto the invoice (like guest_name_cache). The invoice
    // owns its copy from here on, so later editing or archiving the company never
    // changes what an already-issued invoice prints.
    let company: any = null;
    if (input.company_id) {
      const [[row]] = await conn.query<any[]>(
        `SELECT name, oib, vat_id, address, postal_code, city, country
         FROM companies WHERE id = ? AND tenant_id = ? AND active = 1 LIMIT 1`,
        [input.company_id, tenantId],
      );
      if (!row) throw new InvoiceError(422, 'Odabrana tvrtka nije pronađena.');
      company = row;
    }

    const [result] = await conn.query<any>(
      `INSERT INTO invoices (tenant_id, doc_type, premise_id, device_id, guest_id, guest_name_cache,
                             company_id, company_name_cache, company_oib_cache, company_vat_id_cache,
                             company_address_cache, company_postal_code_cache, company_city_cache,
                             company_country_cache,
                             discount_type, discount_value,
                             due_date, payment_method, note, status)
       VALUES (?, 'invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [
        tenantId,
        input.premise_id,
        input.device_id,
        input.guest_id ?? null,
        input.guest_name ?? null,
        company ? input.company_id : null,
        company?.name ?? null,
        company?.oib ?? null,
        company?.vat_id ?? null,
        company?.address ?? null,
        company?.postal_code ?? null,
        company?.city ?? null,
        company?.country ?? null,
        input.discount_type ?? 'none',
        input.discount_value ?? 0,
        input.due_date ?? null,
        input.payment_method,
        input.note ?? null,
      ],
    );
    const invoiceId = result.insertId as number;
    await insertItems(conn, tenantId, invoiceId, input.items);
    await conn.commit();
    await audit({ tenantId, userId, action: 'invoice.draft', entity: 'invoice', entityId: invoiceId });
    return invoiceId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Draft items are stored with rate 0; the real rates and line amounts are
// frozen when the invoice is issued (issueInvoice).
async function insertItems(conn: any, tenantId: number, invoiceId: number, items: LineInput[]) {
  let order = 0;
  for (const item of items) {
    // The line discount is stored as entered; the resolved EUR amount (and any share
    // of a whole-invoice discount) is only frozen at issue, by computeTotals.
    const base = round2(item.quantity * item.unit_price);
    await conn.query(
      `INSERT INTO invoice_items (invoice_id, tenant_id, description, quantity, unit, unit_price,
                                  discount_type, discount_value,
                                  vat_category, vat_rate, line_base, line_vat, line_total, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
      [invoiceId, tenantId, item.description, item.quantity, item.unit, item.unit_price,
       item.discount_type ?? 'none', item.discount_value ?? 0,
       item.vat_category, base, base, order++],
    );
  }
}

// ---- Issue ------------------------------------------------------------------

export async function issueInvoice(tenantId: number, userId: number, invoiceId: number) {
  // Gate: profile must be complete before ANY invoice can be issued.
  const onboarding = await getOnboardingStatus(tenantId);
  if (!onboarding.canIssueInvoices) {
    throw new InvoiceError(422, 'Profil nije potpun — dovršite obavezne podatke prije izdavanja računa.');
  }

  const [[operator]] = await pool.query<any[]>(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [userId]);

  const conn = await pool.getConnection();
  let numberFull = '';
  try {
    await conn.beginTransaction();

    // Lock the draft row; abort if already issued (prevents double issue/fiscalize).
    const [[inv]] = await conn.query<any[]>(
      `SELECT * FROM invoices WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [invoiceId, tenantId],
    );
    if (!inv) throw new InvoiceError(404, 'Račun nije pronađen.');
    if (inv.status !== 'draft') {
      await conn.rollback();
      return getInvoiceFull(tenantId, invoiceId); // idempotent — already issued
    }

    const [[premise]] = await conn.query<any[]>(
      `SELECT code FROM premises WHERE id = ? AND tenant_id = ?`,
      [inv.premise_id, tenantId],
    );
    const [[device]] = await conn.query<any[]>(
      `SELECT code FROM devices WHERE id = ? AND tenant_id = ?`,
      [inv.device_id, tenantId],
    );
    if (!premise || !device) throw new InvoiceError(422, 'Nedostaje poslovni prostor ili naplatni uređaj.');

    const [[dt]] = await conn.query<any[]>(
      `SELECT YEAR(CURDATE()) AS y, CURDATE() AS d, NOW() AS dt`,
    );
    const year = Number(dt.y);
    const issueDate = dt.d as string;

    // VAT applicability is frozen from the status effective on the ISSUE DATE,
    // so a mid-year transition splits invoices correctly (before/after date).
    const vatApplicable = (await resolveVatStatusOnDate(tenantId, issueDate)) === 'obveznik';

    const seq = await nextSeq(conn, tenantId, inv.premise_id, inv.device_id, year);
    numberFull = `${seq}/${premise.code}/${device.code}`;

    // Freeze totals with rates effective on the issue date. The discount columns MUST
    // be read back here and fed into computeTotals — leave them out and the draft
    // shows a discount that the issued (and fiscalized) invoice silently drops.
    const [items] = await conn.query<any[]>(
      `SELECT description, quantity, unit, unit_price, vat_category, discount_type, discount_value
       FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC`,
      [invoiceId],
    );
    const computed = await computeTotals(
      items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit: it.unit,
        unit_price: Number(it.unit_price),
        vat_category: it.vat_category,
        discount_type: it.discount_type as DiscountType,
        discount_value: Number(it.discount_value),
      })),
      vatApplicable,
      issueDate,
      { type: inv.discount_type as DiscountType, value: Number(inv.discount_value) },
    );

    await conn.query(
      `UPDATE invoices SET status='issued', year=?, seq=?, number_full=?, issue_date=?, issue_datetime=?,
              vat_applicable=?, vat_clause=?, subtotal_gross=?, discount_total=?, subtotal=?,
              vat_total=?, total=?, operator_label=?,
              fiscal_status='pending'
       WHERE id = ?`,
      [
        year,
        seq,
        numberFull,
        issueDate,
        dt.dt,
        vatApplicable ? 1 : 0,
        vatApplicable ? null : VAT_EXEMPTION_CLAUSE,
        computed.subtotal_gross,
        computed.discount_total,
        computed.subtotal,
        computed.vat_total,
        computed.total,
        operator?.full_name ?? null,
        invoiceId,
      ],
    );

    // Rewrite items with frozen rates/amounts.
    await conn.query(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invoiceId]);
    let order = 0;
    for (const l of computed.lines) {
      await conn.query(
        `INSERT INTO invoice_items (invoice_id, tenant_id, description, quantity, unit, unit_price,
                                    discount_type, discount_value, discount_amount,
                                    vat_category, vat_rate, line_base, line_vat, line_total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, tenantId, l.description, l.quantity, l.unit, l.unit_price,
         l.discount_type ?? 'none', l.discount_value ?? 0, l.discount_amount,
         l.vat_category, l.vat_rate, l.line_base, l.line_vat, l.line_total, order++],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Fiscalize AFTER commit — the numbered invoice must persist even if the tax
  // authority is unreachable (then it becomes a pending "naknadna" retry).
  await fiscalizeInvoice(tenantId, invoiceId, 'fiscalize');
  await audit({ tenantId, userId, action: 'invoice.issue', entity: 'invoice', entityId: invoiceId, meta: { number: numberFull } });
  return getInvoiceFull(tenantId, invoiceId);
}

async function nextSeq(conn: any, tenantId: number, premiseId: number, deviceId: number, year: number): Promise<number> {
  await conn.query(
    `INSERT INTO invoice_sequences (tenant_id, premise_id, device_id, year, last_number)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
    [tenantId, premiseId, deviceId, year],
  );
  const [rows] = await conn.query(
    `SELECT last_number FROM invoice_sequences WHERE tenant_id=? AND premise_id=? AND device_id=? AND year=?`,
    [tenantId, premiseId, deviceId, year],
  );
  return Number((rows as any[])[0].last_number);
}

// ---- Fiscalization (with retry queue) --------------------------------------

export async function fiscalizeInvoice(
  tenantId: number,
  invoiceId: number,
  operation: 'fiscalize' | 'cancel',
): Promise<void> {
  const [[inv]] = await pool.query<any[]>(
    `SELECT * FROM invoices WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [invoiceId, tenantId],
  );
  if (!inv) return;
  const [[profile]] = await pool.query<any[]>(
    `SELECT oib FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );

  const idem = `${operation}-${invoiceId}`;
  // Upsert the fiscal request and bump attempts.
  await pool.query(
    `INSERT INTO fiscal_requests (tenant_id, invoice_id, operation, status, attempts, idempotency_key,
                                  deadline_at)
     VALUES (?, ?, ?, 'pending', 1, ?, DATE_ADD(NOW(), INTERVAL 48 HOUR))
     ON DUPLICATE KEY UPDATE attempts = attempts + 1, status = 'pending', next_attempt_at = NULL`,
    [tenantId, invoiceId, operation, idem],
  );
  const [[fr]] = await pool.query<any[]>(`SELECT attempts FROM fiscal_requests WHERE idempotency_key = ?`, [idem]);
  const attempt = Number(fr?.attempts ?? 1);

  const payload: FiscalInvoice = {
    invoiceId,
    numberFull: inv.number_full,
    issueDatetime: inv.issue_datetime,
    total: Number(inv.total),
    oib: profile?.oib ?? null,
    operatorLabel: inv.operator_label,
    paymentMethod: inv.payment_method,
    vatApplicable: Boolean(inv.vat_applicable),
    attempt,
    note: inv.note,
  };

  const provider = getFiscalProvider();
  const result = operation === 'cancel' ? await provider.cancel(payload) : await provider.fiscalize(payload);

  if (result.status === 'confirmed') {
    await pool.query(
      `UPDATE invoices SET jir=?, zki=?, fiscal_status='confirmed', fiscalized_at=NOW() WHERE id=?`,
      [result.jir ?? null, result.zki ?? null, invoiceId],
    );
    await pool.query(
      `UPDATE fiscal_requests SET status='confirmed', jir=?, zki=?, last_error=NULL WHERE idempotency_key=?`,
      [result.jir ?? null, result.zki ?? null, idem],
    );
  } else {
    await pool.query(`UPDATE invoices SET fiscal_status='pending' WHERE id=?`, [invoiceId]);
    await pool.query(
      `UPDATE fiscal_requests SET status='pending', last_error=?, next_attempt_at=DATE_ADD(NOW(), INTERVAL 5 MINUTE)
       WHERE idempotency_key=?`,
      [result.error ?? 'Nepoznata greška', idem],
    );
  }
}

// ---- Storno -----------------------------------------------------------------

export async function cancelInvoice(tenantId: number, userId: number, originalId: number, reason: string) {
  const conn = await pool.getConnection();
  let stornoId = 0;
  try {
    await conn.beginTransaction();
    const [[orig]] = await conn.query<any[]>(
      `SELECT * FROM invoices WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [originalId, tenantId],
    );
    if (!orig) throw new InvoiceError(404, 'Račun nije pronađen.');
    if (orig.doc_type !== 'invoice') throw new InvoiceError(422, 'Storno se radi samo nad računom.');
    if (orig.status !== 'issued') throw new InvoiceError(422, 'Storno je moguć samo za izdani račun.');
    if (orig.cancelled_by_invoice_id) throw new InvoiceError(409, 'Račun je već storniran.');

    const [[dt]] = await conn.query<any[]>(`SELECT YEAR(CURDATE()) AS y, CURDATE() AS d, NOW() AS dt`);
    const year = Number(dt.y);
    const seq = await nextSeq(conn, tenantId, orig.premise_id, orig.device_id, year);

    const [[premise]] = await conn.query<any[]>(`SELECT code FROM premises WHERE id = ?`, [orig.premise_id]);
    const [[device]] = await conn.query<any[]>(`SELECT code FROM devices WHERE id = ?`, [orig.device_id]);
    const numberFull = `${seq}/${premise.code}/${device.code}`;

    const [[operator]] = await conn.query<any[]>(`SELECT full_name FROM users WHERE id = ?`, [userId]);

    const [stornoRes] = await conn.query<any>(
      `INSERT INTO invoices (tenant_id, doc_type, premise_id, device_id, guest_id, guest_name_cache,
              company_id, company_name_cache, company_oib_cache, company_vat_id_cache,
              company_address_cache, company_postal_code_cache, company_city_cache, company_country_cache,
              discount_type, discount_value, discount_total, subtotal_gross,
              year, seq, number_full, status, issue_date, issue_datetime, payment_method, currency,
              vat_applicable, vat_clause, subtotal, vat_total, total, operator_label, note,
              fiscal_status, cancels_invoice_id)
       VALUES (?, 'storno', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        tenantId, orig.premise_id, orig.device_id, orig.guest_id, orig.guest_name_cache,
        // Mirror the original's company copy, not the live companies row — the storno
        // must show exactly what the cancelled invoice showed.
        orig.company_id, orig.company_name_cache, orig.company_oib_cache, orig.company_vat_id_cache,
        orig.company_address_cache, orig.company_postal_code_cache, orig.company_city_cache,
        orig.company_country_cache,
        // The discount as entered carries over as-is; the resolved euro amounts are
        // negated like every other amount on a storno.
        orig.discount_type, orig.discount_value,
        -Number(orig.discount_total), -Number(orig.subtotal_gross),
        year, seq, numberFull, dt.d, dt.dt, orig.payment_method, orig.currency,
        orig.vat_applicable, orig.vat_clause,
        -Number(orig.subtotal), -Number(orig.vat_total), -Number(orig.total),
        operator?.full_name ?? null, `Storno računa ${orig.number_full}. Razlog: ${reason}`,
        originalId,
      ],
    );
    stornoId = stornoRes.insertId;

    // Mirror items with negated amounts.
    const [items] = await conn.query<any[]>(
      `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC`,
      [originalId],
    );
    let order = 0;
    for (const it of items) {
      await conn.query(
        `INSERT INTO invoice_items (invoice_id, tenant_id, description, quantity, unit, unit_price,
                                    discount_type, discount_value, discount_amount,
                                    vat_category, vat_rate, line_base, line_vat, line_total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [stornoId, tenantId, it.description, -Number(it.quantity), it.unit, it.unit_price,
         it.discount_type, it.discount_value, -Number(it.discount_amount),
         it.vat_category, it.vat_rate, -Number(it.line_base), -Number(it.line_vat), -Number(it.line_total), order++],
      );
    }

    await conn.query(
      `UPDATE invoices SET status='cancelled', cancelled_by_invoice_id=?, cancelled_at=NOW(), cancelled_reason=?
       WHERE id = ?`,
      [stornoId, reason, originalId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await fiscalizeInvoice(tenantId, stornoId, 'fiscalize');
  await audit({ tenantId, userId, action: 'invoice.storno', entity: 'invoice', entityId: originalId, meta: { stornoId } });
  return getInvoiceFull(tenantId, stornoId);
}

// ---- Helpers ----------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Representative Porezna verification payload (exact URL confirmed in Phase 0).
function buildQr(inv: any): string | null {
  if (inv.status !== 'issued' || (!inv.jir && !inv.zki)) return null;
  const dt = (inv.issue_datetime ?? '').replace(/[-:]/g, '').replace(' ', '_').slice(0, 13);
  const iznos = Math.round(Math.abs(Number(inv.total)) * 100);
  const key = inv.jir ? `jir=${inv.jir}` : `zki=${inv.zki}`;
  return `https://porezna.gov.hr/rn?${key}&datv=${dt}&izn=${iznos}`;
}
