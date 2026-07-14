import type { Request, Response, NextFunction } from 'express';
import { AUTH_COOKIE } from '../config/env';
import { loadSession, verifyToken } from '../services/auth.service';

// Populates req.auth from the session cookie. Every protected route relies on
// req.auth.tenantId to scope its queries — there is no ambient tenant.
//
// The cookie only proves *who* the request is; the roles and the tenant are re-read from the
// database on every request (loadSession). A 30-day token that still carried its original
// claims would mean a deleted user, a demoted admin, or a logged-out session kept its access
// until the token expired.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Niste prijavljeni.' });
    return;
  }
  const claims = verifyToken(token);
  if (!claims) {
    res.status(401).json({ error: 'Sesija je istekla. Prijavite se ponovno.' });
    return;
  }
  try {
    const ctx = await loadSession(claims);
    if (!ctx) {
      res.status(401).json({ error: 'Sesija je istekla. Prijavite se ponovno.' });
      return;
    }
    req.auth = ctx;
    next();
  } catch (err) {
    // Express 4 does not catch rejections from async middleware — hand it to the error handler.
    next(err);
  }
}

// Guards the /admin/* surface. Runs after requireAuth.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.platformRole !== 'admin') {
    res.status(403).json({ error: 'Nemate ovlasti za pristup administraciji.' });
    return;
  }
  next();
}

// Guards what a tenant member must not touch: the signing certificate, the eVisitor
// credentials, and the business identity the invoices are issued under.
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.tenantRole !== 'owner') {
    res.status(403).json({ error: 'Samo vlasnik računa može mijenjati ove postavke.' });
    return;
  }
  next();
}
