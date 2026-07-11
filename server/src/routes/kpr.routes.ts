import { Router } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { getKprEntries, kprCsv, renderKprPdf, renderKprXlsx } from '../services/kpr.service';

export const kprRouter = Router();
kprRouter.use(requireAuth);

function yearOf(req: import('express').Request): number {
  const y = Number(req.query.year);
  return Number.isInteger(y) && y > 2000 ? y : new Date().getUTCFullYear();
}

kprRouter.get(
  '/',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const entries = await getKprEntries(req.auth!.tenantId, year);
    res.json({ year, entries });
  }),
);

kprRouter.get(
  '/xlsx',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const [[profile]] = await pool.query<any[]>(
      `SELECT legal_name FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
      [req.auth!.tenantId],
    );
    const entries = await getKprEntries(req.auth!.tenantId, year);
    const buf = await renderKprXlsx(entries, profile?.legal_name ?? '', year);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kpr-${year}.xlsx"`);
    res.send(buf);
  }),
);

kprRouter.get(
  '/csv',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const entries = await getKprEntries(req.auth!.tenantId, year);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kpr-${year}.csv"`);
    res.send(kprCsv(entries));
  }),
);

kprRouter.get(
  '/pdf',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const [[profile]] = await pool.query<any[]>(
      `SELECT legal_name FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
      [req.auth!.tenantId],
    );
    const entries = await getKprEntries(req.auth!.tenantId, year);
    const pdf = await renderKprPdf(entries, profile?.legal_name ?? '', year);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="kpr-${year}.pdf"`);
    res.send(pdf);
  }),
);
