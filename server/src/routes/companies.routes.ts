import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { isValidOib } from '../utils/oib';
import { audit } from '../services/audit.service';

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

// OIB stays optional — a foreign company has a VAT ID instead. But when one IS
// entered we validate it, because it gets printed on an invoice.
const companySchema = z.object({
  name: z.string().min(2, 'Unesite naziv tvrtke.').max(191),
  oib: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidOib(v), 'Neispravan OIB (mora imati 11 znamenki i ispravnu kontrolnu znamenku).')
    .optional()
    .or(z.literal('')),
  vat_id: z.string().max(20).optional().or(z.literal('')),
  address: z.string().max(191).optional().or(z.literal('')),
  postal_code: z.string().max(10).optional().or(z.literal('')),
  city: z.string().max(120).optional().or(z.literal('')),
  country: z.string().max(60).optional().or(z.literal('')),
  email: z.string().max(191).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  note: z.string().max(500).optional().or(z.literal('')),
});

const norm = (v?: string | null) => (v && String(v).trim() !== '' ? String(v).trim() : null);

const FIELDS = `id, name, oib, vat_id, address, postal_code, city, country, email, phone, note, active`;

companiesRouter.get(
  '/',
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const params: any[] = [req.auth!.tenantId];
    let where = 'tenant_id = ? AND active = 1';
    if (q) {
      where += ' AND (name LIKE ? OR oib LIKE ? OR vat_id LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const [rows] = await pool.query<any[]>(
      `SELECT ${FIELDS} FROM companies WHERE ${where} ORDER BY name ASC LIMIT 500`,
      params,
    );
    res.json(rows);
  }),
);

companiesRouter.post(
  '/',
  wrap(async (req, res) => {
    const input = companySchema.parse(req.body);
    try {
      const [result] = await pool.query<any>(
        `INSERT INTO companies (tenant_id, name, oib, vat_id, address, postal_code, city, country, email, phone, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.auth!.tenantId,
          input.name.trim(),
          norm(input.oib),
          norm(input.vat_id),
          norm(input.address),
          norm(input.postal_code),
          norm(input.city),
          norm(input.country),
          norm(input.email),
          norm(input.phone),
          norm(input.note),
        ],
      );
      await audit({
        tenantId: req.auth!.tenantId,
        userId: req.auth!.userId,
        action: 'company.create',
        entity: 'company',
        entityId: result.insertId,
        ip: req.ip,
      });
      res.status(201).json({ id: result.insertId });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Tvrtka s tim OIB-om već postoji.' });
        return;
      }
      throw err;
    }
  }),
);

// Editing a company does NOT touch invoices already issued to it — each invoice
// carries its own copy of the data (see 006_companies.sql).
companiesRouter.put(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const input = companySchema.parse(req.body);
    try {
      const [result] = await pool.query<any>(
        `UPDATE companies SET name = ?, oib = ?, vat_id = ?, address = ?, postal_code = ?, city = ?,
                country = ?, email = ?, phone = ?, note = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          input.name.trim(),
          norm(input.oib),
          norm(input.vat_id),
          norm(input.address),
          norm(input.postal_code),
          norm(input.city),
          norm(input.country),
          norm(input.email),
          norm(input.phone),
          norm(input.note),
          id,
          req.auth!.tenantId,
        ],
      );
      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Tvrtka nije pronađena.' });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Tvrtka s tim OIB-om već postoji.' });
        return;
      }
      throw err;
    }
  }),
);

// Soft-archive (keeps history / referenced invoices intact).
companiesRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query<any>(
      `UPDATE companies SET active = 0 WHERE id = ? AND tenant_id = ?`,
      [id, req.auth!.tenantId],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Tvrtka nije pronađena.' });
      return;
    }
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'company.archive',
      entity: 'company',
      entityId: id,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
