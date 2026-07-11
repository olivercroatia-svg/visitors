import mysql from 'mysql2/promise';
import { env } from '../config/env';

// Shared connection pool for the app. Every tenant-scoped query must pass
// tenant_id explicitly — the pool itself is tenant-agnostic.
export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  dateStrings: true,
  charset: 'utf8mb4',
});

export async function ping(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
