import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireOwner } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';

// Reads stay open — the invoice form needs the premise/device pickers. Writes are owner-only:
// premise.code is the "POSL" part of every invoice number, and deactivating a premise takes its
// devices with it.
export const premisesRouter = Router();
premisesRouter.use(requireAuth);

const premiseSchema = z.object({
  name: z.string().min(2, 'Unesite naziv prostora.').max(160),
  code: z
    .string()
    .trim()
    .min(1, 'Unesite oznaku prostora.')
    .max(20)
    .regex(/^[A-Za-z0-9]+$/, 'Oznaka smije sadržavati samo slova i brojeve.'),
  address: z.string().max(191).optional().or(z.literal('')),
  city: z.string().max(120).optional().or(z.literal('')),
  postal_code: z.string().max(10).optional().or(z.literal('')),
  municipality_id: z.number().int().positive().nullable().optional(),
});

const norm = (v?: string | null) => (v && String(v).trim() !== '' ? String(v).trim() : null);

// List active premises, each with its active devices nested (drives the
// settings UI and, later, the invoice premise/device pickers).
premisesRouter.get(
  '/',
  wrap(async (req, res) => {
    const [premises] = await pool.query<any[]>(
      `SELECT p.id, p.name, p.code, p.address, p.city, p.postal_code, p.municipality_id, p.active,
              m.name AS municipality_name
       FROM premises p
       LEFT JOIN municipalities m ON m.id = p.municipality_id
       WHERE p.tenant_id = ? AND p.active = 1
       ORDER BY p.name ASC`,
      [req.auth!.tenantId],
    );
    const [devices] = await pool.query<any[]>(
      `SELECT id, premise_id, code, label FROM devices
       WHERE tenant_id = ? AND active = 1 ORDER BY code ASC`,
      [req.auth!.tenantId],
    );
    const byPremise = new Map<number, any[]>();
    for (const d of devices) {
      if (!byPremise.has(d.premise_id)) byPremise.set(d.premise_id, []);
      byPremise.get(d.premise_id)!.push(d);
    }
    res.json(
      premises.map((p) => ({ ...p, devices: byPremise.get(p.id) ?? [] })),
    );
  }),
);

premisesRouter.post(
  '/',
  requireOwner,
  wrap(async (req, res) => {
    const input = premiseSchema.parse(req.body);
    try {
      const [result] = await pool.query<any>(
        `INSERT INTO premises (tenant_id, name, code, address, city, postal_code, municipality_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.auth!.tenantId,
          input.name,
          input.code.toUpperCase(),
          norm(input.address),
          norm(input.city),
          norm(input.postal_code),
          input.municipality_id ?? null,
        ],
      );
      await audit({
        tenantId: req.auth!.tenantId,
        userId: req.auth!.userId,
        action: 'premise.create',
        entity: 'premise',
        entityId: result.insertId,
        ip: req.ip,
      });
      res.status(201).json({ id: result.insertId });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Prostor s tom oznakom već postoji.' });
        return;
      }
      throw err;
    }
  }),
);

premisesRouter.put(
  '/:id',
  requireOwner,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const input = premiseSchema.parse(req.body);
    try {
      const [result] = await pool.query<any>(
        `UPDATE premises SET name = ?, code = ?, address = ?, city = ?, postal_code = ?, municipality_id = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          input.name,
          input.code.toUpperCase(),
          norm(input.address),
          norm(input.city),
          norm(input.postal_code),
          input.municipality_id ?? null,
          id,
          req.auth!.tenantId,
        ],
      );
      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Prostor nije pronađen.' });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Prostor s tom oznakom već postoji.' });
        return;
      }
      throw err;
    }
  }),
);

// Soft-deactivate (keeps history / referenced invoices intact).
premisesRouter.delete(
  '/:id',
  requireOwner,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query<any>(
      `UPDATE premises SET active = 0 WHERE id = ? AND tenant_id = ?`,
      [id, req.auth!.tenantId],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Prostor nije pronađen.' });
      return;
    }
    await pool.query(`UPDATE devices SET active = 0 WHERE premise_id = ? AND tenant_id = ?`, [
      id,
      req.auth!.tenantId,
    ]);
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'premise.deactivate',
      entity: 'premise',
      entityId: id,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
