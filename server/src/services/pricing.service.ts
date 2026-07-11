import { pool } from '../db/pool';

// Standard exemption note for small taxpayers outside the VAT system.
// (Refined against the official wording in Phase 0.)
export const VAT_EXEMPTION_CLAUSE =
  'PDV nije obračunat sukladno članku 90. stavku 2. Zakona o porezu na dodanu vrijednost (mali porezni obveznik).';

export interface LineInput {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_category: string;
}

export interface ComputedLine extends LineInput {
  vat_rate: number;
  line_base: number;
  line_vat: number;
  line_total: number;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  subtotal: number;
  vat_total: number;
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Resolve the VAT rate effective on a given date for a category. Returns 0 for
// unknown categories or when nothing is effective yet.
export async function resolveVatRate(category: string, onDate: string): Promise<number> {
  const [rows] = await pool.query<any[]>(
    `SELECT rate FROM tax_rates
     WHERE category = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
     ORDER BY valid_from DESC LIMIT 1`,
    [category, onDate, onDate],
  );
  return rows.length ? Number(rows[0].rate) : 0;
}

// Compute frozen line + invoice totals. Non-VAT payers get rate 0 on every line
// (the exemption clause is attached at the invoice level, not per line).
export async function computeTotals(
  items: LineInput[],
  vatApplicable: boolean,
  issueDate: string,
): Promise<ComputedTotals> {
  const lines: ComputedLine[] = [];
  let subtotal = 0;
  let vatTotal = 0;

  for (const item of items) {
    const rate = vatApplicable ? await resolveVatRate(item.vat_category, issueDate) : 0;
    const base = round2(item.quantity * item.unit_price);
    const vat = round2((base * rate) / 100);
    const total = round2(base + vat);
    subtotal = round2(subtotal + base);
    vatTotal = round2(vatTotal + vat);
    lines.push({ ...item, vat_rate: rate, line_base: base, line_vat: vat, line_total: total });
  }

  return { lines, subtotal, vat_total: vatTotal, total: round2(subtotal + vatTotal) };
}
