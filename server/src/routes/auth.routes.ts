import { Router } from 'express';
import { z } from 'zod';
import { AUTH_COOKIE, env } from '../config/env';
import {
  emailExists,
  getUserWithProfile,
  registerTenant,
  signToken,
  verifyCredentials,
} from '../services/auth.service';
import { audit } from '../services/audit.service';
import { requireAuth } from '../middleware/auth';
import type { AuthContext } from '../types';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email('Neispravna email adresa.'),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 znakova.'),
  fullName: z.string().min(2, 'Unesite ime i prezime.'),
  businessName: z.string().min(2, 'Unesite naziv obrta ili djelatnosti.'),
  profileType: z.enum(['privatni_iznajmljivac', 'pausalni_obrt']),
  vatStatus: z.enum(['nije_obveznik', 'obveznik']),
});

const loginSchema = z.object({
  email: z.string().email('Neispravna email adresa.'),
  password: z.string().min(1, 'Unesite lozinku.'),
});

function setSessionCookie(res: import('express').Response, ctx: AuthContext): void {
  res.cookie(AUTH_COOKIE, signToken(ctx), {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    if (await emailExists(input.email)) {
      res.status(409).json({ error: 'Korisnik s ovom email adresom već postoji.' });
      return;
    }
    const { ctx, user } = await registerTenant(input);
    setSessionCookie(res, ctx);
    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'auth.register',
      entity: 'user',
      entityId: ctx.userId,
      ip: req.ip,
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await verifyCredentials(input.email, input.password);
    if (!result) {
      res.status(401).json({ error: 'Neispravan email ili lozinka.' });
      return;
    }
    setSessionCookie(res, result.ctx);
    await audit({
      tenantId: result.ctx.tenantId,
      userId: result.ctx.userId,
      action: 'auth.login',
      ip: req.ip,
    });
    res.json({ user: result.user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const data = await getUserWithProfile(req.auth!.userId);
    if (!data) {
      res.status(404).json({ error: 'Korisnik nije pronađen.' });
      return;
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});
