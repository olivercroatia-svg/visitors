import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import {
  getPlatformStats,
  listTenants,
  getTenantDetail,
  getSystemHealth,
  getPlatformAudit,
  getPlatformSettings,
  updatePlatformSetting,
  listTaxRates,
  addTaxRate,
  listMunicipalitiesAdmin,
  updateMunicipality,
} from '../services/admin.service';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/stats', wrap(async (_req, res) => res.json(await getPlatformStats())));
adminRouter.get('/tenants', wrap(async (_req, res) => res.json(await listTenants())));
adminRouter.get(
  '/tenants/:id',
  wrap(async (req, res) => {
    const detail = await getTenantDetail(Number(req.params.id));
    if (!detail) {
      res.status(404).json({ error: 'Korisnik nije pronađen.' });
      return;
    }
    res.json(detail);
  }),
);
adminRouter.get('/health', wrap(async (_req, res) => res.json(await getSystemHealth())));
adminRouter.get('/audit', wrap(async (_req, res) => res.json(await getPlatformAudit(60))));

// ---- Platform settings ----
adminRouter.get('/settings', wrap(async (_req, res) => res.json(await getPlatformSettings())));

const settingSchema = z.object({ key: z.string().min(1), value: z.string() });
adminRouter.put(
  '/settings',
  wrap(async (req, res) => {
    const { key, value } = settingSchema.parse(req.body);
    await updatePlatformSetting(key, value, req.auth!.userId);
    res.json(await getPlatformSettings());
  }),
);

// ---- Effective-dated tax rates ----
const CATEGORY_LABELS: Record<string, string> = {
  smjestaj: 'Smještaj (snižena stopa)',
  standard: 'Standardna stopa',
  snizena_5: 'Snížena stopa 5%',
  oslobodeno: 'Oslobođeno / izvan sustava PDV-a',
};

adminRouter.get('/tax-rates', wrap(async (_req, res) => res.json(await listTaxRates())));

const rateSchema = z.object({
  category: z.string().min(1).max(60),
  rate: z.number().min(0).max(100),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum.'),
  label: z.string().max(120).optional(),
});
adminRouter.post(
  '/tax-rates',
  wrap(async (req, res) => {
    const input = rateSchema.parse(req.body);
    let label: string = input.label ?? input.category;
    if (!input.label) {
      const [[existing]] = await pool.query<any[]>(
        `SELECT label FROM tax_rates WHERE category = ? ORDER BY valid_from DESC LIMIT 1`,
        [input.category],
      );
      label = existing?.label ?? CATEGORY_LABELS[input.category] ?? input.category;
    }
    await addTaxRate(input.category, label, input.rate, input.valid_from, req.auth!.userId);
    res.status(201).json(await listTaxRates());
  }),
);

// ---- JLS (municipalities) ----
adminRouter.get('/municipalities', wrap(async (_req, res) => res.json(await listMunicipalitiesAdmin())));

const nullableMoney = z.number().nonnegative().nullable();
const muniSchema = z.object({
  flat_tax_per_bed_eur: nullableMoney,
  tourist_tax_high_eur: nullableMoney,
  tourist_tax_low_eur: nullableMoney,
});
adminRouter.put(
  '/municipalities/:id',
  wrap(async (req, res) => {
    const data = muniSchema.parse(req.body);
    await updateMunicipality(Number(req.params.id), data, req.auth!.userId);
    res.json({ ok: true });
  }),
);
