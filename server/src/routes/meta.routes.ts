import { Router } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

export const metaRouter = Router();

// Read-only settings the authenticated app needs (e.g. the VAT threshold and
// warning levels that drive the compliance dashboard). Single source of truth:
// platform_settings, editable later from the admin backoffice.
metaRouter.get('/settings', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN ('pdv_threshold_eur', 'pdv_threshold_warn_levels', 'fiscal_retry_deadline_hours')`,
    );
    const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
    res.json({
      pdvThresholdEur: Number(map.get('pdv_threshold_eur') ?? 60000),
      warnLevels: JSON.parse(map.get('pdv_threshold_warn_levels') ?? '[70,85,95]'),
      fiscalRetryDeadlineHours: Number(map.get('fiscal_retry_deadline_hours') ?? 48),
    });
  } catch (err) {
    next(err);
  }
});
