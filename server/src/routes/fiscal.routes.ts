import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { isValidOib } from '../utils/oib';
import { audit } from '../services/audit.service';
import { CertError } from '../fiscal/cert';
import { deleteCertificate, getCertView, saveCertificate } from '../fiscal/certStore';

export const fiscalRouter = Router();
fiscalRouter.use(requireAuth);

// The .p12 arrives base64-encoded in JSON rather than as multipart: it is a few KB, and
// this avoids pulling in an upload middleware for one endpoint.
const certSchema = z.object({
  p12_base64: z.string().min(1, 'Odaberite datoteku certifikata.'),
  password: z.string().min(1, 'Unesite lozinku certifikata.'),
  environment: z.enum(['test', 'prod']),
  filename: z.string().max(191).nullable().optional(),
});

const sequenceSchema = z.object({ sequence_mark: z.enum(['P', 'N']) });

// OibOper — the OIB of the person issuing the invoice. Empty means "the same OIB as the
// business", which is what a one-person obrt always wants; invoice.service COALESCEs it.
const operatorSchema = z.object({
  oib: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || isValidOib(v),
      'Neispravan OIB (mora imati 11 znamenki i ispravnu kontrolnu znamenku).',
    ),
});

function handleCertError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof CertError) {
    res.status(422).json({ error: err.message });
    return true;
  }
  return false;
}

fiscalRouter.get('/certificate', wrap(async (req, res) => {
  res.json(await getCertView(req.auth!.tenantId));
}));

fiscalRouter.put('/certificate', wrap(async (req, res) => {
  const input = certSchema.parse(req.body);
  try {
    const cert = await saveCertificate(
      req.auth!.tenantId,
      Buffer.from(input.p12_base64, 'base64'),
      input.password,
      input.environment,
      input.filename ?? null,
    );
    await audit({
      tenantId: req.auth!.tenantId, userId: req.auth!.userId,
      action: 'fiscal.certificate.save', entity: 'fiscal_certificate',
      meta: { environment: input.environment, oib: cert.oib, valid_to: cert.validTo }, ip: req.ip,
    });
    res.json(await getCertView(req.auth!.tenantId));
  } catch (err) {
    if (!handleCertError(err, res)) throw err;
  }
}));

fiscalRouter.delete('/certificate', wrap(async (req, res) => {
  await deleteCertificate(req.auth!.tenantId);
  await audit({
    tenantId: req.auth!.tenantId, userId: req.auth!.userId,
    action: 'fiscal.certificate.delete', entity: 'fiscal_certificate', ip: req.ip,
  });
  res.json({ ok: true });
}));

// OznSlijed — the taxpayer declares to the tax authority whether invoice numbers run per
// premise or per device, and the message must match that declaration.
fiscalRouter.put('/sequence-mark', wrap(async (req, res) => {
  const { sequence_mark } = sequenceSchema.parse(req.body);
  await pool.query(`UPDATE business_profiles SET sequence_mark = ? WHERE tenant_id = ?`, [
    sequence_mark,
    req.auth!.tenantId,
  ]);
  await audit({
    tenantId: req.auth!.tenantId, userId: req.auth!.userId,
    action: 'fiscal.sequence_mark', entity: 'business_profile',
    meta: { sequence_mark }, ip: req.ip,
  });
  res.json({ ok: true });
}));

fiscalRouter.put('/operator-oib', wrap(async (req, res) => {
  const { oib } = operatorSchema.parse(req.body);
  const value = oib === '' ? null : oib;
  await pool.query(`UPDATE users SET oib = ? WHERE id = ?`, [value, req.auth!.userId]);
  await audit({
    tenantId: req.auth!.tenantId, userId: req.auth!.userId,
    action: 'fiscal.operator_oib', entity: 'user', entityId: req.auth!.userId,
    meta: { oib: value }, ip: req.ip,
  });
  res.json({ ok: true });
}));
