import { pool } from '../db/pool';

// Standard exemption note for small taxpayers outside the VAT system.
// (Refined against the official wording in Phase 0.)
export const VAT_EXEMPTION_CLAUSE =
  'PDV nije obračunat sukladno članku 90. stavku 2. Zakona o porezu na dodanu vrijednost (mali porezni obveznik).';

export type DiscountType = 'none' | 'percent' | 'amount';

// A discount is entered either as a percentage or as a fixed EUR amount.
// `value` is stored AS ENTERED (10 for "10%", 30 for "30 EUR").
export interface InvoiceDiscount {
  type: DiscountType;
  value: number;
}

export interface LineInput {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_category: string;
  discount_type?: DiscountType;
  discount_value?: number;
}

export interface ComputedLine extends LineInput {
  vat_rate: number;
  line_gross: number; // quantity × unit_price, before any discount
  discount_amount: number; // resolved EUR discount for this line
  line_base: number; // line_gross − discount_amount (the taxable base)
  line_vat: number;
  line_total: number;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  subtotal_gross: number; // Σ line_gross
  discount_total: number; // Σ discount_amount
  subtotal: number; // Σ line_base
  vat_total: number;
  total: number;
}

// Thrown when a discount would exceed what it is discounting. Carries a status so
// the route can surface it like an InvoiceError (defined here rather than imported
// from invoice.service, which already imports this module).
export class PricingError extends Error {
  status = 422;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Split `target` euros across `weights` proportionally, in whole cents, using the
// largest-remainder method: floor every share, then hand the leftover cents to the
// lines with the biggest fractional parts. Guarantees Σ result === target exactly,
// which is what keeps SUM(line_base) === subtotal to the cent.
function allocatePro(target: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (target <= 0 || totalWeight <= 0) return weights.map(() => 0);

  const targetCents = Math.round(target * 100);
  const raw = weights.map((w) => (targetCents * w) / totalWeight);
  const cents = raw.map((r) => Math.floor(r));
  const leftover = targetCents - cents.reduce((a, b) => a + b, 0);

  // Biggest fraction first; ties go to the earlier line so the split is deterministic.
  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; k < leftover; k++) cents[byFraction[k % byFraction.length].i] += 1;

  return cents.map((c, i) => Math.min(c / 100, weights[i]));
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

// Resolve a discount against the amount it applies to. Rejects rather than clamps:
// a discount bigger than the thing it discounts is a data-entry mistake, and
// silently zeroing the line would put a wrong figure on a tax document.
function resolveDiscount(type: DiscountType | undefined, value: number | undefined, base: number, what: string): number {
  if (!type || type === 'none' || !value) return 0;
  if (value < 0) throw new PricingError('Popust ne može biti negativan.');

  if (type === 'percent') {
    if (value > 100) throw new PricingError(`Popust ne može biti veći od 100% (${what}).`);
    return round2((base * value) / 100);
  }
  if (round2(value) > base) {
    throw new PricingError(`Popust je veći od iznosa ${what} (${round2(value)} € na ${base} €).`);
  }
  return round2(value);
}

// Compute frozen line + invoice totals. Non-VAT payers get rate 0 on every line
// (the exemption clause is attached at the invoice level, not per line).
//
// A whole-invoice discount is allocated pro-rata down into the lines instead of
// being subtracted from the total, because VAT is per line and the rates differ.
// Either kind of discount ends up as a per-line `discount_amount`, so a printed row
// always reconciles: quantity × unit_price − discount = line amount.
export async function computeTotals(
  items: LineInput[],
  vatApplicable: boolean,
  issueDate: string,
  invoiceDiscount?: InvoiceDiscount,
): Promise<ComputedTotals> {
  const gross = items.map((it) => round2(it.quantity * it.unit_price));
  const ownDiscount = items.map((it, i) =>
    resolveDiscount(it.discount_type, it.discount_value, gross[i], `stavke „${it.description}"`),
  );

  // Whole-invoice discount: resolve against the gross, then split it across the lines.
  const grossTotal = round2(gross.reduce((a, b) => round2(a + b), 0));
  const invoiceTarget = resolveDiscount(invoiceDiscount?.type, invoiceDiscount?.value, grossTotal, 'računa');
  const allocated = allocatePro(invoiceTarget, gross);

  const lines: ComputedLine[] = [];
  let subtotalGross = 0;
  let discountTotal = 0;
  let subtotal = 0;
  let vatTotal = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rate = vatApplicable ? await resolveVatRate(item.vat_category, issueDate) : 0;
    const discount = round2(ownDiscount[i] + allocated[i]);
    const base = round2(gross[i] - discount);
    const vat = round2((base * rate) / 100);
    const total = round2(base + vat);

    subtotalGross = round2(subtotalGross + gross[i]);
    discountTotal = round2(discountTotal + discount);
    subtotal = round2(subtotal + base);
    vatTotal = round2(vatTotal + vat);

    lines.push({
      ...item,
      vat_rate: rate,
      line_gross: gross[i],
      discount_amount: discount,
      line_base: base,
      line_vat: vat,
      line_total: total,
    });
  }

  return {
    lines,
    subtotal_gross: subtotalGross,
    discount_total: discountTotal,
    subtotal,
    vat_total: vatTotal,
    total: round2(subtotal + vatTotal),
  };
}
