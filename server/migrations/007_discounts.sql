-- 007_discounts.sql
-- Discounts: either per line OR on the whole invoice, entered as a percentage or
-- a fixed EUR amount. The two modes are mutually exclusive on one invoice.
--
-- A whole-invoice discount is NOT subtracted from invoices.total. It is allocated
-- pro-rata down into the lines (largest-remainder), so that:
--
--   line_base = round2(quantity * unit_price) - discount_amount
--   SUM(line_base) === subtotal      (exactly, to the cent)
--
-- That invariant is what keeps VAT correct (rates differ per line) and what keeps
-- every existing consumer of the money columns right without any change — KPR and
-- analytics both stay consistent, and analytics `by_category` (the only aggregate
-- that sums invoice_items.line_total rather than invoices.total) still reconciles
-- with the revenue KPI.
--
-- discount_value stores the figure AS ENTERED (10 for "10%", 30.00 for "30 EUR");
-- discount_amount stores the resolved EUR figure. Both are frozen at issue like
-- every other amount on an invoice.
--
-- The 'none' / 0 defaults mean existing invoices stay correct with no data
-- migration: subtotal_gross is only read when discount_total > 0.

ALTER TABLE invoice_items
  ADD COLUMN discount_type   ENUM('none','percent','amount') NOT NULL DEFAULT 'none' AFTER unit_price,
  ADD COLUMN discount_value  DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_type,
  ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_value;

ALTER TABLE invoices
  ADD COLUMN discount_type   ENUM('none','percent','amount') NOT NULL DEFAULT 'none' AFTER vat_clause,
  ADD COLUMN discount_value  DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_type,
  ADD COLUMN discount_total  DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_value,
  ADD COLUMN subtotal_gross  DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_total;
