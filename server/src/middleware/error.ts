import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Nije pronađeno.' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Neispravni podaci.',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Došlo je do greške na poslužitelju.' });
}
