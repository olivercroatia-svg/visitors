import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { audit } from '../services/audit.service';
import { CODEBOOK_KINDS } from '../evisitor/codebooks';
import type { CodebookKind } from '../evisitor/types';
import {
  acknowledgeMessage,
  deleteCredentials,
  EVisitorError,
  getCodebook,
  getCredentialsView,
  importFacilities,
  listMessages,
  saveCredentials,
  syncCodebooks,
  verifyCredentials,
} from '../services/evisitor.service';

export const evisitorRouter = Router();
evisitorRouter.use(requireAuth);

const credentialsSchema = z.object({
  username: z.string().min(1, 'Unesite korisničko ime.').max(120),
  // Absent = keep the stored one. Present = replace it. The current value is never sent
  // to the client, so there is nothing to round-trip.
  password: z.string().max(200).optional(),
  apikey: z.string().max(200).optional(),
  environment: z.enum(['test', 'prod']),
});

function handleEVisitorError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof EVisitorError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

evisitorRouter.get('/credentials', wrap(async (req, res) => {
  res.json(await getCredentialsView(req.auth!.tenantId));
}));

evisitorRouter.put('/credentials', wrap(async (req, res) => {
  const input = credentialsSchema.parse(req.body);
  try {
    await saveCredentials(req.auth!.tenantId, input);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'evisitor.credentials.save', entity: 'evisitor_credentials',
      meta: { environment: input.environment }, ip: req.ip,
    });
    res.json(await getCredentialsView(req.auth!.tenantId));
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

evisitorRouter.delete('/credentials', wrap(async (req, res) => {
  await deleteCredentials(req.auth!.tenantId);
  await audit({
    tenantId: req.auth!.tenantId, userId: req.auth!.userId,
    action: 'evisitor.credentials.delete', entity: 'evisitor_credentials', ip: req.ip,
  });
  res.json({ ok: true });
}));

evisitorRouter.post('/credentials/test', wrap(async (req, res) => {
  try {
    const result = await verifyCredentials(req.auth!.tenantId);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'evisitor.verify', entity: 'evisitor_credentials',
      meta: { status: result.status }, ip: req.ip,
    });
    if (result.status === 'confirmed') {
      res.json({ ok: true });
      return;
    }
    // Show eVisitor's own wording — ch. 4.4.6 requires the message to reach the user.
    res.status(422).json({ error: result.error ?? 'Veza s eVisitorom nije uspjela.' });
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

evisitorRouter.get('/codebooks/:kind', wrap(async (req, res) => {
  const kind = req.params.kind as CodebookKind;
  if (!CODEBOOK_KINDS.includes(kind)) {
    res.status(404).json({ error: 'Nepoznat šifrarnik.' });
    return;
  }
  res.json(await getCodebook(kind));
}));

evisitorRouter.post('/codebooks/sync', wrap(async (req, res) => {
  try {
    const counts = await syncCodebooks(req.auth!.tenantId);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'evisitor.codebooks.sync', entity: 'evisitor_codebooks', meta: counts, ip: req.ip,
    });
    res.json({ ok: true, counts });
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

// Pull the tenant's objects from eVisitor so nobody has to transcribe facility codes.
evisitorRouter.post('/facilities/import', wrap(async (req, res) => {
  try {
    const imported = await importFacilities(req.auth!.tenantId);
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'evisitor.facilities.import', entity: 'accommodation_object',
      meta: { imported }, ip: req.ip,
    });
    res.json({ ok: true, imported });
  } catch (err) {
    if (!handleEVisitorError(err, res)) throw err;
  }
}));

// Ch. 4.4.6 — the user must be able to see and manage every eVisitor system message.
evisitorRouter.get('/messages', wrap(async (req, res) => {
  res.json(await listMessages(req.auth!.tenantId, req.query.open === '1'));
}));

evisitorRouter.post('/messages/:id/ack', wrap(async (req, res) => {
  const ok = await acknowledgeMessage(req.auth!.tenantId, req.auth!.userId, Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Poruka nije pronađena.' });
    return;
  }
  res.json({ ok: true });
}));
