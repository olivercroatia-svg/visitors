import type { Request, Response, NextFunction } from 'express';

// Wraps an async route handler so rejected promises reach the error middleware
// instead of crashing the process. Keeps route files free of repetitive
// try/catch boilerplate.
type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

export const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
