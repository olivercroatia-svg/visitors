import { VAT_CATEGORIES } from '@/features/settings/api';
import type { DiscountType, NewInvoiceItem } from './api';

// Client-side mirror of server/src/services/pricing.service.ts. The server stays the
// authority (it freezes the rates at issue), but the live preview must agree with it
// to the cent — otherwise the user confirms one total and gets another. Keep the two
// in step: same rounding, same largest-remainder allocation.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface InvoiceDiscount {
  type: DiscountType;
  value: number;
}

export interface PreviewLine {
  line_gross: number;
  discount_amount: number;
  line_base: number;
  line_vat: number;
  line_total: number;
}

export interface Preview {
  lines: PreviewLine[];
  subtotal_gross: number;
  discount_total: number;
  subtotal: number;
  vat: number;
  total: number;
  error: string | null; // set when a discount exceeds what it discounts
}

function allocatePro(target: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (target <= 0 || totalWeight <= 0) return weights.map(() => 0);

  const targetCents = Math.round(target * 100);
  const raw = weights.map((w) => (targetCents * w) / totalWeight);
  const cents = raw.map((r) => Math.floor(r));
  const leftover = targetCents - cents.reduce((a, b) => a + b, 0);

  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; k < leftover; k++) cents[byFraction[k % byFraction.length].i] += 1;

  return cents.map((c, i) => Math.min(c / 100, weights[i]));
}

function resolve(type: DiscountType, value: number, base: number): number {
  if (type === 'none' || !value) return 0;
  if (type === 'percent') return round2((base * Math.min(value, 100)) / 100);
  return round2(Math.min(value, base));
}

function tooBig(type: DiscountType, value: number, base: number): boolean {
  if (type === 'none' || !value) return false;
  return type === 'percent' ? value > 100 : round2(value) > base;
}

export function computePreview(
  rows: NewInvoiceItem[],
  vatApplicable: boolean,
  invoiceDiscount: InvoiceDiscount,
): Preview {
  const gross = rows.map((r) => round2(r.quantity * r.unit_price));

  let error: string | null = null;
  rows.forEach((r, i) => {
    if (tooBig(r.discount_type, r.discount_value, gross[i])) {
      error = `Popust je veći od iznosa stavke „${r.description || 'bez opisa'}".`;
    }
  });

  const own = rows.map((r, i) => resolve(r.discount_type, r.discount_value, gross[i]));
  const grossTotal = round2(gross.reduce((a, b) => round2(a + b), 0));

  if (tooBig(invoiceDiscount.type, invoiceDiscount.value, grossTotal)) {
    error = 'Popust je veći od iznosa računa.';
  }
  const allocated = allocatePro(resolve(invoiceDiscount.type, invoiceDiscount.value, grossTotal), gross);

  const lines: PreviewLine[] = [];
  let subtotalGross = 0;
  let discountTotal = 0;
  let subtotal = 0;
  let vat = 0;

  rows.forEach((r, i) => {
    const rate = vatApplicable ? VAT_CATEGORIES.find((c) => c.value === r.vat_category)?.rate ?? 0 : 0;
    const discount = round2(own[i] + allocated[i]);
    const base = round2(gross[i] - discount);
    const lineVat = round2((base * rate) / 100);

    subtotalGross = round2(subtotalGross + gross[i]);
    discountTotal = round2(discountTotal + discount);
    subtotal = round2(subtotal + base);
    vat = round2(vat + lineVat);

    lines.push({
      line_gross: gross[i],
      discount_amount: discount,
      line_base: base,
      line_vat: lineVat,
      line_total: round2(base + lineVat),
    });
  });

  return {
    lines,
    subtotal_gross: subtotalGross,
    discount_total: discountTotal,
    subtotal,
    vat,
    total: round2(subtotal + vat),
    error,
  };
}
