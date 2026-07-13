import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import {
  createDraft,
  issueInvoice,
  cancelInvoice,
  fiscalizeInvoice,
  getInvoiceFull,
  listInvoices,
  InvoiceError,
  type DraftInput,
} from '../services/invoice.service';
import { PricingError } from '../services/pricing.service';
import { renderInvoicePdf } from '../services/pdf.service';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

const discountType = z.enum(['none', 'percent', 'amount']).optional();
const discountValue = z.number().nonnegative('Popust ne može biti negativan.').optional();

const itemSchema = z.object({
  description: z.string().min(1, 'Unesite opis stavke.').max(255),
  quantity: z.number().positive('Količina mora biti veća od 0.'),
  unit: z.string().min(1).max(30),
  unit_price: z.number().nonnegative('Cijena ne može biti negativna.'),
  vat_category: z.string().min(1).max(60),
  discount_type: discountType,
  discount_value: discountValue,
});

const draftSchema = z
  .object({
    premise_id: z.number().int().positive(),
    device_id: z.number().int().positive(),
    guest_id: z.number().int().positive().nullable().optional(),
    guest_name: z.string().max(240).nullable().optional(),
    company_id: z.number().int().positive().nullable().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    payment_method: z.enum(['gotovina', 'kartica', 'transakcijski', 'ostalo']),
    note: z.string().max(500).nullable().optional(),
    discount_type: discountType,
    discount_value: discountValue,
    items: z.array(itemSchema).min(1, 'Dodajte barem jednu stavku.'),
  })
  // A discount is either per line or on the whole invoice — never both. Allowing both
  // would mean discounting a discount, which nobody can reconcile off the printed page.
  .refine(
    (d) => {
      const onInvoice = d.discount_type && d.discount_type !== 'none' && (d.discount_value ?? 0) > 0;
      const onLines = d.items.some((i) => i.discount_type && i.discount_type !== 'none' && (i.discount_value ?? 0) > 0);
      return !(onInvoice && onLines);
    },
    { message: 'Popust je moguć ili po stavkama ili na cijeli račun — ne oboje.' },
  );

function handleInvoiceError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof InvoiceError || err instanceof PricingError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

// Dashboard stats (net revenue YTD + fiscalization counts).
invoicesRouter.get(
  '/stats',
  wrap(async (req, res) => {
    const [[row]] = await pool.query<any[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN status='issued' AND doc_type='invoice' AND YEAR(issue_date)=YEAR(CURDATE())
                           THEN total ELSE 0 END), 0) AS revenue_ytd,
         SUM(CASE WHEN status='issued' AND doc_type='invoice' THEN 1 ELSE 0 END) AS issued_count,
         SUM(CASE WHEN status='issued' AND doc_type='invoice' AND fiscal_status='confirmed' THEN 1 ELSE 0 END) AS fiscalized_count,
         SUM(CASE WHEN fiscal_status='pending' THEN 1 ELSE 0 END) AS pending_fiscal
       FROM invoices WHERE tenant_id = ?`,
      [req.auth!.tenantId],
    );
    res.json({
      revenue_ytd: Number(row.revenue_ytd),
      issued_count: Number(row.issued_count ?? 0),
      fiscalized_count: Number(row.fiscalized_count ?? 0),
      pending_fiscal: Number(row.pending_fiscal ?? 0),
    });
  }),
);

invoicesRouter.get(
  '/',
  wrap(async (req, res) => {
    const rows = await listInvoices(req.auth!.tenantId, {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    });
    res.json(rows);
  }),
);

invoicesRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const invoice = await getInvoiceFull(req.auth!.tenantId, Number(req.params.id));
    if (!invoice) {
      res.status(404).json({ error: 'Račun nije pronađen.' });
      return;
    }
    res.json(invoice);
  }),
);

// Create a draft (no number, not fiscalized).
invoicesRouter.post(
  '/draft',
  wrap(async (req, res) => {
    const input = draftSchema.parse(req.body) as DraftInput;
    const id = await createDraft(req.auth!.tenantId, req.auth!.userId, input);
    res.status(201).json({ id });
  }),
);

// Create + issue in one step (main flow). Gate is enforced inside issueInvoice.
invoicesRouter.post(
  '/issue',
  wrap(async (req, res) => {
    const input = draftSchema.parse(req.body) as DraftInput;
    try {
      const id = await createDraft(req.auth!.tenantId, req.auth!.userId, input);
      const invoice = await issueInvoice(req.auth!.tenantId, req.auth!.userId, id);
      res.status(201).json(invoice);
    } catch (err) {
      if (handleInvoiceError(err, res)) return;
      throw err;
    }
  }),
);

// Issue an existing draft.
invoicesRouter.post(
  '/:id/issue',
  wrap(async (req, res) => {
    try {
      const invoice = await issueInvoice(req.auth!.tenantId, req.auth!.userId, Number(req.params.id));
      res.json(invoice);
    } catch (err) {
      if (handleInvoiceError(err, res)) return;
      throw err;
    }
  }),
);

const stornoSchema = z.object({ reason: z.string().min(3, 'Navedite razlog storna.').max(255) });

invoicesRouter.post(
  '/:id/storno',
  wrap(async (req, res) => {
    const { reason } = stornoSchema.parse(req.body);
    try {
      const storno = await cancelInvoice(req.auth!.tenantId, req.auth!.userId, Number(req.params.id), reason);
      res.json(storno);
    } catch (err) {
      if (handleInvoiceError(err, res)) return;
      throw err;
    }
  }),
);

// Naknadna fiskalizacija — retry a pending invoice.
invoicesRouter.post(
  '/:id/retry-fiscal',
  wrap(async (req, res) => {
    await fiscalizeInvoice(req.auth!.tenantId, Number(req.params.id), 'fiscalize');
    const invoice = await getInvoiceFull(req.auth!.tenantId, Number(req.params.id));
    res.json(invoice);
  }),
);

invoicesRouter.get(
  '/:id/pdf',
  wrap(async (req, res) => {
    const invoice = await getInvoiceFull(req.auth!.tenantId, Number(req.params.id));
    if (!invoice) {
      res.status(404).json({ error: 'Račun nije pronađen.' });
      return;
    }
    const [[profile]] = await pool.query<any[]>(
      `SELECT legal_name, oib, address, city, postal_code, iban, vat_status
       FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
      [req.auth!.tenantId],
    );
    const pdf = await renderInvoicePdf(invoice, profile);
    const filename = `racun-${(invoice.number_full ?? invoice.id).toString().replace(/\//g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdf);
  }),
);
