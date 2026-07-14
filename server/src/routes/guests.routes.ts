import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';
import { getCodebook } from '../services/evisitor.service';
import { getOcrProvider } from '../ocr';
import { verifyMrz } from '../ocr/mrz';
import type { ExtractedGuest, ScanMediaType } from '../ocr/types';

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

// ---------------------------------------------------------------------------
// POST /guests/scan — read an ID document and RETURN the fields. Nothing else.
//
// This route deliberately does NOT write to the database. It creates no guest, updates no
// guest, creates no stay, and never touches eVisitor. It decodes the images, extracts, drops
// the buffers, and answers. Saving is the user's next, separate click; registering the guest
// with MUP is another one after that. A scan must never start a chain the user did not ask for.
// ---------------------------------------------------------------------------

// This is the only endpoint in the app that costs real money per call, so it is the only one
// an authenticated user can use to run up a bill. Key by user, not IP — several landlords can
// share an office NAT, and one of them should not exhaust the others' quota. requireAuth runs
// before this on the router, so req.auth is always populated (no IP fallback, which would also
// trip express-rate-limit's IPv6 guard).
const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.auth!.userId),
  message: { error: 'Previše skeniranja u kratkom vremenu. Pokušajte ponovno za sat vremena.' },
});

const MAX_IMAGES = 3;
// A 1600px JPEG lands around 250–400 kB. 1.5 MB is generous headroom and still refuses
// someone posting a full-resolution photo straight through. Mirrors MAX_P12_BYTES in certStore.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

const scanSchema = z.object({
  images: z.array(z.string().min(1)).min(1, 'Dodajte barem jednu fotografiju.').max(MAX_IMAGES),
  media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
});

// The declared media_type is client-supplied, so it is a hint, not a fact. Trust the bytes.
function sniff(buf: Buffer): ScanMediaType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * A country code from a model is a guess until something checks it. Nothing downstream does:
 * Zod only caps the length, the column is CHAR(3), and validateStayInput() only tests for
 * presence — so a hallucinated "XYZ" would sail through and be rejected by MUP *after* the
 * stay row exists. Check it here, while the cost of being wrong is still an empty field.
 *
 * Calibration matters. When the codebook is synced it is authoritative and we reject non-members.
 * When it is not, we are holding the shipped 45-country fallback, which is far too short to
 * judge by — a guest from Argentina is not a hallucination. So: accept the shape, flag it as
 * unverified, and let the user look.
 */
function resolveCountry(
  code: string | null,
  codes: Set<string>,
  synced: boolean,
): { value: string | null; unverified: boolean } {
  if (!code) return { value: null, unverified: false };
  const up = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(up)) return { value: null, unverified: false };
  if (codes.has(up)) return { value: up, unverified: false };
  if (synced) return { value: null, unverified: true }; // authoritative list says no
  return { value: up, unverified: true }; // fallback list is too short to reject on
}

guestsRouter.post(
  '/scan',
  scanLimiter,
  wrap(async (req, res) => {
    const input = scanSchema.parse(req.body);

    // errorHandler collapses anything non-Zod into a generic 500, so answer here rather than
    // throw — these messages tell the user exactly which photo to retake.
    const images: { base64: string; mediaType: ScanMediaType }[] = [];
    for (let i = 0; i < input.images.length; i++) {
      const buf = Buffer.from(input.images[i], 'base64');
      if (buf.length > MAX_IMAGE_BYTES) {
        res.status(413).json({ error: `Fotografija ${i + 1} je prevelika. Najveća veličina je 1,5 MB.` });
        return;
      }
      const mediaType = sniff(buf);
      if (!mediaType) {
        res.status(400).json({
          error: `Datoteka ${i + 1} nije valjana slika (podržani formati: JPEG, PNG, WebP).`,
        });
        return;
      }
      images.push({ base64: input.images[i], mediaType });
    }

    const [countries, docTypes] = await Promise.all([
      getCodebook('country'),
      getCodebook('document_type'),
    ]);
    const countriesSynced = countries.length > 0 && countries[0].synced;
    const docTypesSynced = docTypes.length > 0 && docTypes[0].synced;

    let result;
    try {
      result = await getOcrProvider().extract(images, {
        countries: countries.map((c) => ({ code: c.code, label: c.label })),
        countriesSynced,
        docTypes: docTypes.map((d) => ({ code: d.code, label: d.label })),
        docTypesSynced,
      });
    } catch (err) {
      console.error('[ocr] extraction failed', err);
      res.status(502).json({
        error: 'Dokument nije moguće prepoznati. Pokušajte s oštrijom fotografijom.',
      });
      return;
    }

    const fields: ExtractedGuest = { ...result.fields };

    // --- MRZ has priority over the visual read -------------------------------
    // The MRZ carries check digits; the printed side does not. If the arithmetic holds, the
    // machine-readable value is proven and the visual one is merely plausible — so it wins.
    // Names are the exception: the MRZ transliterates them (ČAVIĆ -> CAVIC), so the visual
    // read is strictly better there and is left alone.
    const mrz = verifyMrz(result.mrz);
    const verified: string[] = [];
    if (mrz?.ok) {
      if (mrz.doc_number) { fields.doc_number = mrz.doc_number; verified.push('doc_number'); }
      if (mrz.date_of_birth) { fields.date_of_birth = mrz.date_of_birth; verified.push('date_of_birth'); }
      if (mrz.citizenship_code) { fields.citizenship_code = mrz.citizenship_code; verified.push('citizenship_code'); }
      if (mrz.gender) { fields.gender = mrz.gender; verified.push('gender'); }
    }

    // --- Codebook membership -------------------------------------------------
    const countryCodes = new Set(countries.map((c) => c.code.toUpperCase()));
    const unverified: string[] = [];
    for (const key of ['citizenship_code', 'birth_country_code', 'residence_country_code'] as const) {
      const r = resolveCountry(fields[key], countryCodes, countriesSynced);
      fields[key] = r.value;
      if (r.unverified) unverified.push(key);
    }

    // doc_type_code is eVisitor's own ("008"), not derivable from the document. If the codebook
    // is not synced we cannot know it, so we leave it empty rather than invent one — the same
    // call migration 005 made when it refused to guess this column from doc_type.
    const notes: string[] = [];
    if (result.notes) notes.push(result.notes);
    if (!docTypesSynced) {
      fields.doc_type_code = null;
      notes.push('Šifru vrste dokumenta unesite ručno ili sinkronizirajte šifrarnike (Postavke → eVisitor).');
    } else if (fields.doc_type_code && !docTypes.some((d) => d.code === fields.doc_type_code)) {
      fields.doc_type_code = null;
    }

    // No PII in the audit trail — only that a scan happened, by whom.
    await audit({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      action: 'guest.scan',
      entity: 'guest',
      meta: { images: images.length, kind: result.document_kind, mrz_ok: mrz?.ok ?? null },
      ip: req.ip,
    });

    // The image buffers go out of scope here and are never written anywhere.
    res.json({
      fields,
      document_kind: result.document_kind,
      mrz_present: mrz !== null,
      mrz_ok: mrz?.ok ?? false,
      mrz_failed: mrz?.failed ?? [],
      verified_fields: verified,
      unverified_fields: unverified,
      notes: notes.length > 0 ? notes.join(' ') : null,
    });
  }),
);
