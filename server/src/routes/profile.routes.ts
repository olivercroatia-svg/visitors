import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { isValidOib } from '../utils/oib';
import { audit } from '../services/audit.service';
import { getOnboardingStatus } from '../services/onboarding.service';

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get(
  '/',
  wrap(async (req, res) => {
    const [[profile]] = await pool.query<any[]>(
      `SELECT id, tenant_id, type, legal_name, oib, address, city, postal_code, iban, vat_status, onboarding_completed
       FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
      [req.auth!.tenantId],
    );
    res.json(profile ?? null);
  }),
);

const profileSchema = z.object({
  type: z.enum(['privatni_iznajmljivac', 'pausalni_obrt']),
  legal_name: z.string().min(2, 'Unesite naziv.').max(191),
  oib: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidOib(v), 'Neispravan OIB (mora imati 11 znamenki i ispravnu kontrolnu znamenku).')
    .optional()
    .or(z.literal('')),
  address: z.string().max(191).optional().or(z.literal('')),
  city: z.string().max(120).optional().or(z.literal('')),
  postal_code: z.string().max(10).optional().or(z.literal('')),
  iban: z.string().max(34).optional().or(z.literal('')),
});

// Updates the business profile. VAT status is intentionally NOT editable here —
// switching it must go through the effective-dated wizard (Phase 4) so history
// and invoice freezing stay correct.
profileRouter.put(
  '/',
  wrap(async (req, res) => {
    const input = profileSchema.parse(req.body);
    const norm = (v?: string) => (v && v.trim() !== '' ? v.trim() : null);

    await pool.query(
      `UPDATE business_profiles
       SET type = ?, legal_name = ?, oib = ?, address = ?, city = ?, postal_code = ?, iban = ?
       WHERE tenant_id = ?`,
      [
        input.type,
        norm(input.legal_name),
        norm(input.oib),
        norm(input.address),
        norm(input.city),
        norm(input.postal_code),
        norm(input.iban),
        req.auth!.tenantId,
      ],
    );
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'profile.update',
      entity: 'business_profile',
      ip: req.ip,
    });
    const [[profile]] = await pool.query<any[]>(
      `SELECT id, tenant_id, type, legal_name, oib, address, city, postal_code, iban, vat_status, onboarding_completed
       FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
      [req.auth!.tenantId],
    );
    res.json(profile);
  }),
);

profileRouter.get(
  '/onboarding',
  wrap(async (req, res) => {
    res.json(await getOnboardingStatus(req.auth!.tenantId));
  }),
);
