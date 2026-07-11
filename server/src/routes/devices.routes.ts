import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';

export const devicesRouter = Router();
devicesRouter.use(requireAuth);

const deviceSchema = z.object({
  premise_id: z.number().int().positive(),
  code: z
    .string()
    .trim()
    .min(1, 'Unesite oznaku uređaja.')
    .max(20)
    .regex(/^[A-Za-z0-9]+$/, 'Oznaka smije sadržavati samo slova i brojeve.'),
  label: z.string().max(120).optional().or(z.literal('')),
});

const norm = (v?: string | null) => (v && String(v).trim() !== '' ? String(v).trim() : null);

async function ownsPremise(tenantId: number, premiseId: number): Promise<boolean> {
  const [[row]] = await pool.query<any[]>(
    `SELECT id FROM premises WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [premiseId, tenantId],
  );
  return Boolean(row);
}

devicesRouter.post(
  '/',
  wrap(async (req, res) => {
    const input = deviceSchema.parse(req.body);
    if (!(await ownsPremise(req.auth!.tenantId, input.premise_id))) {
      res.status(404).json({ error: 'Poslovni prostor nije pronađen.' });
      return;
    }
    try {
      const [result] = await pool.query<any>(
        `INSERT INTO devices (tenant_id, premise_id, code, label) VALUES (?, ?, ?, ?)`,
        [req.auth!.tenantId, input.premise_id, input.code.toUpperCase(), norm(input.label)],
      );
      await audit({
        tenantId: req.auth!.tenantId,
        userId: req.auth!.userId,
        action: 'device.create',
        entity: 'device',
        entityId: result.insertId,
        ip: req.ip,
      });
      res.status(201).json({ id: result.insertId });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Uređaj s tom oznakom već postoji u ovom prostoru.' });
        return;
      }
      throw err;
    }
  }),
);

devicesRouter.put(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const bodySchema = deviceSchema.pick({ code: true, label: true });
    const input = bodySchema.parse(req.body);
    try {
      const [result] = await pool.query<any>(
        `UPDATE devices SET code = ?, label = ? WHERE id = ? AND tenant_id = ?`,
        [input.code.toUpperCase(), norm(input.label), id, req.auth!.tenantId],
      );
      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Uređaj nije pronađen.' });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Uređaj s tom oznakom već postoji u ovom prostoru.' });
        return;
      }
      throw err;
    }
  }),
);

devicesRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query<any>(
      `UPDATE devices SET active = 0 WHERE id = ? AND tenant_id = ?`,
      [id, req.auth!.tenantId],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Uređaj nije pronađen.' });
      return;
    }
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'device.deactivate',
      entity: 'device',
      entityId: id,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
