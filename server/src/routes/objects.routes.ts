import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { ownsPremise } from '../utils/ownership';
import { audit } from '../services/audit.service';

// eVisitor accommodation objects (smještajni objekti). Not the fiscal `premises`.
export const objectsRouter = Router();
objectsRouter.use(requireAuth);

const objectSchema = z.object({
  name: z.string().min(1, 'Unesite naziv objekta.').max(160),
  facility_code: z.string().min(1, 'Unesite šifru objekta iz eVisitora.').max(20),
  premise_id: z.number().int().positive().nullable().optional(),
  municipality_id: z.number().int().positive().nullable().optional(),
  address: z.string().max(191).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  default_tt_category: z.string().max(10).nullable().optional(),
});

const norm = (v?: string | null) => (v && String(v).trim() !== '' ? String(v).trim() : null);

objectsRouter.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT id, name, facility_code, premise_id, municipality_id, address, city,
            default_tt_category, active
     FROM accommodation_objects WHERE tenant_id = ?
     ORDER BY active DESC, name ASC`,
    [req.auth!.tenantId],
  );
  res.json(rows);
}));

objectsRouter.post('/', wrap(async (req, res) => {
  const input = objectSchema.parse(req.body);
  if (input.premise_id && !(await ownsPremise(req.auth!.tenantId, input.premise_id))) {
    res.status(404).json({ error: 'Poslovni prostor nije pronađen.' });
    return;
  }
  try {
    const [result] = await pool.query<any>(
      `INSERT INTO accommodation_objects
         (tenant_id, name, facility_code, premise_id, municipality_id, address, city, default_tt_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.auth!.tenantId, input.name.trim(), input.facility_code.trim(),
        input.premise_id ?? null, input.municipality_id ?? null,
        norm(input.address), norm(input.city), norm(input.default_tt_category),
      ],
    );
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'object.create', entity: 'accommodation_object', entityId: result.insertId, ip: req.ip,
    });
    res.status(201).json({ id: result.insertId });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Objekt s tom šifrom već postoji.' });
      return;
    }
    throw err;
  }
}));

objectsRouter.put('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const input = objectSchema.parse(req.body);
  // The WHERE below scopes the row being updated, but not the premise_id coming in.
  if (input.premise_id && !(await ownsPremise(req.auth!.tenantId, input.premise_id))) {
    res.status(404).json({ error: 'Poslovni prostor nije pronađen.' });
    return;
  }
  const [result] = await pool.query<any>(
    `UPDATE accommodation_objects
     SET name = ?, facility_code = ?, premise_id = ?, municipality_id = ?, address = ?, city = ?,
         default_tt_category = ?
     WHERE id = ? AND tenant_id = ?`,
    [
      input.name.trim(), input.facility_code.trim(), input.premise_id ?? null,
      input.municipality_id ?? null, norm(input.address), norm(input.city),
      norm(input.default_tt_category), id, req.auth!.tenantId,
    ],
  );
  if (result.affectedRows === 0) {
    res.status(404).json({ error: 'Objekt nije pronađen.' });
    return;
  }
  await audit({
    tenantId: req.auth!.tenantId, userId: req.auth!.userId,
    action: 'object.update', entity: 'accommodation_object', entityId: id, ip: req.ip,
  });
  res.json({ ok: true });
}));

// Deactivate rather than delete: stays reference the object (ON DELETE RESTRICT), and
// eVisitor keeps its own history of everything ever registered against it.
objectsRouter.delete('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [result] = await pool.query<any>(
    `UPDATE accommodation_objects SET active = 0 WHERE id = ? AND tenant_id = ?`,
    [id, req.auth!.tenantId],
  );
  if (result.affectedRows === 0) {
    res.status(404).json({ error: 'Objekt nije pronađen.' });
    return;
  }
  await audit({
    tenantId: req.auth!.tenantId, userId: req.auth!.userId,
    action: 'object.deactivate', entity: 'accommodation_object', entityId: id, ip: req.ip,
  });
  res.json({ ok: true });
}));
