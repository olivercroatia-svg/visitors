import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';

export const servicesRouter = Router();
servicesRouter.use(requireAuth);

const serviceSchema = z.object({
  name: z.string().min(2, 'Unesite naziv usluge.').max(160),
  unit: z.string().min(1).max(30).default('noć'),
  default_price: z.number().nonnegative('Cijena ne može biti negativna.').default(0),
  vat_category: z.string().min(1).max(60).default('smjestaj'),
});

servicesRouter.get(
  '/',
  wrap(async (req, res) => {
    const [rows] = await pool.query<any[]>(
      `SELECT id, name, unit, default_price, vat_category, active
       FROM services WHERE tenant_id = ? ORDER BY active DESC, name ASC`,
      [req.auth!.tenantId],
    );
    res.json(rows);
  }),
);

servicesRouter.post(
  '/',
  wrap(async (req, res) => {
    const input = serviceSchema.parse(req.body);
    const [result] = await pool.query<any>(
      `INSERT INTO services (tenant_id, name, unit, default_price, vat_category)
       VALUES (?, ?, ?, ?, ?)`,
      [req.auth!.tenantId, input.name, input.unit, input.default_price, input.vat_category],
    );
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'service.create',
      entity: 'service',
      entityId: result.insertId,
      ip: req.ip,
    });
    res.status(201).json({ id: result.insertId });
  }),
);

servicesRouter.put(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const input = serviceSchema.parse(req.body);
    const [result] = await pool.query<any>(
      `UPDATE services SET name = ?, unit = ?, default_price = ?, vat_category = ?
       WHERE id = ? AND tenant_id = ?`,
      [input.name, input.unit, input.default_price, input.vat_category, id, req.auth!.tenantId],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Usluga nije pronađena.' });
      return;
    }
    res.json({ ok: true });
  }),
);

servicesRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query<any>(
      `UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ?`,
      [id, req.auth!.tenantId],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Usluga nije pronađena.' });
      return;
    }
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'service.deactivate',
      entity: 'service',
      entityId: id,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
