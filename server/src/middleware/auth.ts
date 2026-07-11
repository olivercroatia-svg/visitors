import type { Request, Response, NextFunction } from 'express';
import { AUTH_COOKIE } from '../config/env';
import { verifyToken } from '../services/auth.service';

// Populates req.auth from the session cookie. Every protected route relies on
// req.auth.tenantId to scope its queries — there is no ambient tenant.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Niste prijavljeni.' });
    return;
  }
  const ctx = verifyToken(token);
  if (!ctx) {
    res.status(401).json({ error: 'Sesija je istekla. Prijavite se ponovno.' });
    return;
  }
  req.auth = ctx;
  next();
}

// Guards the /admin/* surface. Runs after requireAuth.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.platformRole !== 'admin') {
    res.status(403).json({ error: 'Nemate ovlasti za pristup administraciji.' });
    return;
  }
  next();
}
