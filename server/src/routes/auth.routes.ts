import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AUTH_COOKIE, env } from '../config/env';
import {
  emailExists,
  getUserWithProfile,
  registerTenant,
  revokeSessions,
  signToken,
  verifyCredentials,
  verifyToken,
} from '../services/auth.service';
import { audit } from '../services/audit.service';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import type { AuthContext } from '../types';

export const authRouter = Router();

// Login is unauthenticated and runs a deliberately slow bcrypt compare (cost 12), so an
// unthrottled endpoint is both a credential-stuffing surface and a cheap way to burn the
// server's CPU. Registration is limited harder because it writes rows.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Previše pokušaja prijave. Pokušajte ponovno za 15 minuta.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Previše pokušaja registracije. Pokušajte ponovno za sat vremena.' },
});

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

authRouter.post('/register', registerLimiter, async (req, res, next) => {
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

authRouter.post('/login', loginLimiter, async (req, res, next) => {
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

// Clearing the cookie only removes the browser's copy — a token that has already been
// captured would keep working for the rest of its 30 days. Bumping token_version is what
// actually ends the session. It ends it on every device, which is the right default for an
// app whose tenant is normally one person; per-device logout would need a sessions table.
authRouter.post(
  '/logout',
  wrap(async (req, res) => {
    const token = req.cookies?.[AUTH_COOKIE];
    const claims = token ? verifyToken(token) : null;
    if (claims) await revokeSessions(claims.userId);
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.json({ ok: true });
  }),
);

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
