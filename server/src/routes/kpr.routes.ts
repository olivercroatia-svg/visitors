import { Router } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import {
  getKprEntries,
  kprCsv,
  renderKprPdf,
  renderKprXlsx,
  type KprRange,
} from '../services/kpr.service';

export const kprRouter = Router();
kprRouter.use(requireAuth);

function yearOf(req: import('express').Request): number {
  const y = Number(req.query.year);
  return Number.isInteger(y) && y > 2000 ? y : new Date().getUTCFullYear();
}

// Same ISO-date validation analytics uses (parseFilters). The range only narrows the
// window within the selected year — Rb and Kumulativ still run from 1 January.
function rangeOf(req: import('express').Request): KprRange {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const range: KprRange = {};
  if (typeof req.query.from === 'string' && iso.test(req.query.from)) range.from = req.query.from;
  if (typeof req.query.to === 'string' && iso.test(req.query.to)) range.to = req.query.to;
  return range;
}

// kpr-2026, or kpr-2026-07-01_2026-09-30 when a range is set.
function fileStem(year: number, range: KprRange): string {
  if (range.from && range.to) return `kpr-${range.from}_${range.to}`;
  if (range.from) return `kpr-${year}-od-${range.from}`;
  if (range.to) return `kpr-${year}-do-${range.to}`;
  return `kpr-${year}`;
}

async function profileName(tenantId: number): Promise<string> {
  const [[profile]] = await pool.query<any[]>(
    `SELECT legal_name FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  return profile?.legal_name ?? '';
}

kprRouter.get(
  '/',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const range = rangeOf(req);
    const entries = await getKprEntries(req.auth!.tenantId, year, range);
    res.json({ year, from: range.from ?? null, to: range.to ?? null, entries });
  }),
);

kprRouter.get(
  '/xlsx',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const range = rangeOf(req);
    const entries = await getKprEntries(req.auth!.tenantId, year, range);
    const buf = await renderKprXlsx(entries, await profileName(req.auth!.tenantId), year, range);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem(year, range)}.xlsx"`);
    res.send(buf);
  }),
);

kprRouter.get(
  '/csv',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const range = rangeOf(req);
    const entries = await getKprEntries(req.auth!.tenantId, year, range);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem(year, range)}.csv"`);
    res.send(kprCsv(entries));
  }),
);

kprRouter.get(
  '/pdf',
  wrap(async (req, res) => {
    const year = yearOf(req);
    const range = rangeOf(req);
    const entries = await getKprEntries(req.auth!.tenantId, year, range);
    const pdf = await renderKprPdf(entries, await profileName(req.auth!.tenantId), year, range);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileStem(year, range)}.pdf"`);
    res.send(pdf);
  }),
);
