import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireOwner } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';
import { getComplianceOverview } from '../services/compliance.service';
import { changeVatStatus } from '../services/vat.service';

export const complianceRouter = Router();
complianceRouter.use(requireAuth);

complianceRouter.get(
  '/',
  wrap(async (req, res) => {
    res.json(await getComplianceOverview(req.auth!.tenantId));
  }),
);

const vatSchema = z.object({
  to_status: z.enum(['nije_obveznik', 'obveznik']),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum.'),
  reason: z.string().max(255).nullable().optional(),
});

// Guided VAT status transition (effective-dated). Owner-only: resolveVatStatusOnDate freezes
// this onto every invoice issued from the effective date on, so it is a tax decision, not a
// setting. Reading the overview stays open.
complianceRouter.post(
  '/vat-status',
  requireOwner,
  wrap(async (req, res) => {
    const input = vatSchema.parse(req.body);
    await changeVatStatus(
      req.auth!.tenantId,
      req.auth!.userId,
      input.to_status,
      input.effective_date,
      input.reason ?? null,
    );
    res.json(await getComplianceOverview(req.auth!.tenantId));
  }),
);

const settingsSchema = z.object({
  uses_foreign_platforms: z.boolean(),
  has_vat_id: z.boolean(),
  beds_count: z.number().int().nonnegative().nullable().optional(),
  flat_tax_per_bed_eur: z.number().nonnegative().nullable().optional(),
});

// Compliance inputs: reverse-charge flags + per-bed tax calculator defaults.
complianceRouter.put(
  '/settings',
  requireOwner,
  wrap(async (req, res) => {
    const input = settingsSchema.parse(req.body);
    await pool.query(
      `UPDATE business_profiles
       SET uses_foreign_platforms = ?, has_vat_id = ?, beds_count = ?, flat_tax_per_bed_eur = ?
       WHERE tenant_id = ?`,
      [
        input.uses_foreign_platforms ? 1 : 0,
        input.has_vat_id ? 1 : 0,
        input.beds_count ?? null,
        input.flat_tax_per_bed_eur ?? null,
        req.auth!.tenantId,
      ],
    );
    await audit({ tenantId: req.auth!.tenantId, userId: req.auth!.userId, action: 'compliance.settings' });
    res.json(await getComplianceOverview(req.auth!.tenantId));
  }),
);
