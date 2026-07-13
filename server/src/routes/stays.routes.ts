import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';
import { EVisitorError } from '../services/evisitor.service';
import {
  cancelStay,
  checkOutStay,
  createStay,
  getStay,
  listStays,
  registerStay,
  retryStay,
  updateStay,
  validateStayInput,
} from '../services/stays.service';

export const staysRouter = Router();
staysRouter.use(requireAuth);

// MySQL DATETIME, minute precision — what <input type="datetime-local"> produces.
const datetime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/, 'Neispravan datum i vrijeme.')
  .transform((v) => v.replace('T', ' ').slice(0, 19))
  .transform((v) => (v.length === 16 ? `${v}:00` : v));

const staySchema = z.object({
  object_id: z.number().int().positive('Odaberite smještajni objekt.'),
  guest_id: z.number().int().positive('Odaberite gosta.'),
  check_in_at: datetime,
  foreseen_check_out_at: datetime,
  tt_category: z.string().min(1, 'Odaberite kategoriju boravišne pristojbe.').max(10),
  arrival_org: z.string().min(1).max(10),
  service_type: z.string().min(1).max(40),
  group_ref: z.string().max(40).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

function handleEVisitorError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof EVisitorError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

staysRouter.get('/', wrap(async (req, res) => {
  const rows = await listStays(req.auth!.tenantId, {
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    object_id: req.query.object_id ? Number(req.query.object_id) : undefined,
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
  });
  res.json(rows);
}));

staysRouter.get('/:id', wrap(async (req, res) => {
  const stay = await getStay(req.auth!.tenantId, Number(req.params.id));
  if (!stay) {
    res.status(404).json({ error: 'Boravak nije pronađen.' });
    return;
  }
  res.json(stay);
}));

// Dry run: the check-in form calls this so its inline errors come from the same validator
// that gates the send.
staysRouter.post('/validate', wrap(async (req, res) => {
  const input = staySchema.parse(req.body);
  try {
    res.json({ issues: await validateStayInput(req.auth!.tenantId, input) });
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

// `register: false` saves a draft; `true` also sends the prijava to eVisitor.
staysRouter.post('/', wrap(async (req, res) => {
  const input = staySchema.parse(req.body);
  const register = req.body?.register !== false;
  try {
    const id = await createStay(req.auth!.tenantId, input, register);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: register ? 'stay.checkin' : 'stay.create', entity: 'stay', entityId: id, ip: req.ip,
    });
    res.status(201).json(await getStay(req.auth!.tenantId, id));
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

staysRouter.put('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const input = staySchema.parse(req.body);
  try {
    await updateStay(req.auth!.tenantId, id, input);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'stay.edit', entity: 'stay', entityId: id, ip: req.ip,
    });
    res.json(await getStay(req.auth!.tenantId, id));
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

staysRouter.post('/:id/check-in', wrap(async (req, res) => {
  const id = Number(req.params.id);
  try {
    await registerStay(req.auth!.tenantId, id);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'stay.checkin', entity: 'stay', entityId: id, ip: req.ip,
    });
    res.json(await getStay(req.auth!.tenantId, id));
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

staysRouter.post('/:id/check-out', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { check_out_at } = z.object({ check_out_at: datetime }).parse(req.body);
  try {
    await checkOutStay(req.auth!.tenantId, id, check_out_at);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'stay.checkout', entity: 'stay', entityId: id, ip: req.ip,
    });
    res.json(await getStay(req.auth!.tenantId, id));
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

staysRouter.post('/:id/cancel', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = z
    .object({ reason: z.string().min(1, 'Unesite razlog poništenja.').max(255) })
    .parse(req.body);
  try {
    await cancelStay(req.auth!.tenantId, id, reason);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'stay.cancel', entity: 'stay', entityId: id, meta: { reason }, ip: req.ip,
    });
    res.json(await getStay(req.auth!.tenantId, id));
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

// "Naknadna prijava" — same idea as the invoice retry-fiscal button.
staysRouter.post('/:id/retry', wrap(async (req, res) => {
  const id = Number(req.params.id);
  try {
    await retryStay(req.auth!.tenantId, id);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'stay.retry', entity: 'stay', entityId: id, ip: req.ip,
    });
    res.json(await getStay(req.auth!.tenantId, id));
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));
