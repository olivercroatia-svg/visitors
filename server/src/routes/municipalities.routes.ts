import { Router } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';

export const municipalitiesRouter = Router();
municipalitiesRouter.use(requireAuth);

// JLS lookup for the premise location picker (and later per-bed tax / tourist fees).
municipalitiesRouter.get(
  '/',
  wrap(async (_req, res) => {
    const [rows] = await pool.query<any[]>(
      `SELECT id, name, county FROM municipalities WHERE active = 1 ORDER BY name ASC`,
    );
    res.json(rows);
  }),
);
