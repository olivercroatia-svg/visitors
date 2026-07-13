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

  // eVisitor fields. Optional here — a guest only needs them to be checked in, and the
  // billing-only quick-add on the invoice screen must keep working without them.
  // validation.ts is what insists on completeness, at check-in time.
  middle_name: z.string().max(64).nullable().optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('')),
  gender: z.enum(['muski', 'zenski']).nullable().optional().or(z.literal('')),
  citizenship_code: z.string().max(3).nullable().optional().or(z.literal('')),
  birth_country_code: z.string().max(3).nullable().optional().or(z.literal('')),
  birth_city: z.string().max(64).nullable().optional().or(z.literal('')),
  residence_country_code: z.string().max(3).nullable().optional().or(z.literal('')),
  residence_city: z.string().max(64).nullable().optional().or(z.literal('')),
  residence_city_code: z.string().max(30).nullable().optional().or(z.literal('')),
  residence_address: z.string().max(191).nullable().optional().or(z.literal('')),
  doc_type_code: z.string().max(10).nullable().optional().or(z.literal('')),
  visa_type: z.string().max(60).nullable().optional().or(z.literal('')),
  visa_number: z.string().max(40).nullable().optional().or(z.literal('')),
  visa_validity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('')),
});

const norm = (v?: string | null) => (v && String(v).trim() !== '' ? String(v).trim() : null);

const EVISITOR_FIELDS = [
  'middle_name', 'date_of_birth', 'gender', 'citizenship_code', 'birth_country_code',
  'birth_city', 'residence_country_code', 'residence_city', 'residence_city_code',
  'residence_address', 'doc_type_code', 'visa_type', 'visa_number', 'visa_validity_date',
] as const;

const BASE_FIELDS = [
  'first_name', 'last_name', 'country', 'doc_type', 'doc_number',
  'email', 'phone', 'address', 'city', 'note',
] as const;

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
      `SELECT id, first_name, middle_name, last_name, country, doc_type, doc_number, email, phone,
              address, city, note, date_of_birth, gender, citizenship_code, birth_country_code,
              birth_city, residence_country_code, residence_city, residence_city_code,
              residence_address, doc_type_code, visa_type, visa_number, visa_validity_date, created_at
       FROM guests WHERE ${where} ORDER BY last_name ASC, first_name ASC LIMIT 500`,
      params,
    );
    res.json(rows);
  }),
);

type GuestInput = z.infer<typeof guestSchema>;

function baseValues(input: GuestInput) {
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
    const columns = [...BASE_FIELDS, ...EVISITOR_FIELDS];
    const values = [
      ...baseValues(input),
      ...EVISITOR_FIELDS.map((f) => norm(input[f] as string | null | undefined)),
    ];
    const [result] = await pool.query<any>(
      `INSERT INTO guests (tenant_id, ${columns.join(', ')})
       VALUES (?, ${columns.map(() => '?').join(', ')})`,
      [req.auth!.tenantId, ...values],
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

    const sets = BASE_FIELDS.map((f) => `${f} = ?`);
    const params: any[] = baseValues(input);

    // Only touch an eVisitor column if the caller actually sent it. The invoice screen's
    // guest form knows nothing about these fields, and saving from there must not wipe
    // the check-in data someone entered on the Boravci screen.
    for (const f of EVISITOR_FIELDS) {
      if (!(f in req.body)) continue;
      sets.push(`${f} = ?`);
      params.push(norm(input[f] as string | null | undefined));
    }

    params.push(id, req.auth!.tenantId);
    const [result] = await pool.query<any>(
      `UPDATE guests SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params,
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
