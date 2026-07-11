import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';

export const guestsRouter = Router();
guestsRouter.use(requireAuth);

const guestSchema = z.object({
  first_name: z.string().min(1, 'Unesite ime.').max(120),
  last_name: z.string().min(1, 'Unesite prezime.').max(120),
  country: z.string().max(60).optional().or(z.literal('')),
  doc_type: z.enum(['osobna', 'putovnica', 'ostalo']).nullable().optional(),
  doc_number: z.string().max(60).optional().or(z.literal('')),
  email: z.string().email('Neispravan email.').max(191).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  address: z.string().max(191).optional().or(z.literal('')),
  city: z.string().max(120).optional().or(z.literal('')),
  note: z.string().max(500).optional().or(z.literal('')),
});

const norm = (v?: string | null) => (v && String(v).trim() !== '' ? String(v).trim() : null);

// List with optional search across name / email / phone.
guestsRouter.get(
  '/',
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const params: any[] = [req.auth!.tenantId];
    let where = 'tenant_id = ?';
    if (q) {
      where += ' AND (CONCAT(first_name, " ", last_name) LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const [rows] = await pool.query<any[]>(
      `SELECT id, first_name, last_name, country, doc_type, doc_number, email, phone, address, city, note, created_at
       FROM guests WHERE ${where} ORDER BY last_name ASC, first_name ASC LIMIT 500`,
      params,
    );
    res.json(rows);
  }),
);

function values(input: z.infer<typeof guestSchema>) {
  return [
    input.first_name.trim(),
    input.last_name.trim(),
    norm(input.country) ?? 'Hrvatska',
    input.doc_type ?? null,
    norm(input.doc_number),
    norm(input.email),
    norm(input.phone),
    norm(input.address),
    norm(input.city),
    norm(input.note),
  ];
}

guestsRouter.post(
  '/',
  wrap(async (req, res) => {
    const input = guestSchema.parse(req.body);
    const [result] = await pool.query<any>(
      `INSERT INTO guests (tenant_id, first_name, last_name, country, doc_type, doc_number, email, phone, address, city, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.auth!.tenantId, ...values(input)],
    );
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'guest.create',
      entity: 'guest',
      entityId: result.insertId,
      ip: req.ip,
    });
    res.status(201).json({ id: result.insertId });
  }),
);

guestsRouter.put(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const input = guestSchema.parse(req.body);
    const [result] = await pool.query<any>(
      `UPDATE guests SET first_name = ?, last_name = ?, country = ?, doc_type = ?, doc_number = ?,
              email = ?, phone = ?, address = ?, city = ?, note = ?
       WHERE id = ? AND tenant_id = ?`,
      [...values(input), id, req.auth!.tenantId],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Gost nije pronađen.' });
      return;
    }
    res.json({ ok: true });
  }),
);

guestsRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query<any>(`DELETE FROM guests WHERE id = ? AND tenant_id = ?`, [
      id,
      req.auth!.tenantId,
    ]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Gost nije pronađen.' });
      return;
    }
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'guest.delete',
      entity: 'guest',
      entityId: id,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
