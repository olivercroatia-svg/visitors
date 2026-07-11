import { Router } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { getAnalytics, getFilteredInvoiceRows, parseFilters } from '../services/analytics.service';
import { exportCsv, exportXlsx, exportPdf, type ExportMeta } from '../services/analyticsExport.service';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

async function metaFor(tenantId: number, filters: ReturnType<typeof parseFilters>): Promise<ExportMeta> {
  const [[profile]] = await pool.query<any[]>(
    `SELECT legal_name FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  return { profileName: profile?.legal_name ?? '', from: filters.from, to: filters.to };
}

analyticsRouter.get(
  '/',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await getAnalytics(req.auth!.tenantId, filters));
  }),
);

analyticsRouter.get(
  '/export.csv',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    const rows = await getFilteredInvoiceRows(req.auth!.tenantId, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="analitika.csv"');
    res.send(exportCsv(rows));
  }),
);

analyticsRouter.get(
  '/export.xlsx',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    const [analytics, rows, meta] = await Promise.all([
      getAnalytics(req.auth!.tenantId, filters),
      getFilteredInvoiceRows(req.auth!.tenantId, filters),
      metaFor(req.auth!.tenantId, filters),
    ]);
    const buf = await exportXlsx(analytics, rows, meta);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="analitika.xlsx"');
    res.send(buf);
  }),
);

analyticsRouter.get(
  '/export.pdf',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    const [analytics, meta] = await Promise.all([
      getAnalytics(req.auth!.tenantId, filters),
      metaFor(req.auth!.tenantId, filters),
    ]);
    const buf = await exportPdf(analytics, meta);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="analitika.pdf"');
    res.send(buf);
  }),
);
