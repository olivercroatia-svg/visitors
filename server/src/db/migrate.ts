import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

// Versioned migration runner.
// - Ensures the target database exists.
// - Reads server/migrations/*.sql in filename order.
// - Applies each pending file inside a transaction and records it in
//   schema_migrations so re-runs are idempotent (safe on every deploy).

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function ensureDatabase(): Promise<void> {
  const admin = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.end();
}

async function run(): Promise<void> {
  await ensureDatabase();

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [rows] = await conn.query<any[]>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`→ applying ${file} ... `);
    try {
      await conn.beginTransaction();
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      await conn.commit();
      count++;
      process.stdout.write('ok\n');
    } catch (err) {
      await conn.rollback();
      process.stdout.write('FAILED\n');
      console.error(err);
      await conn.end();
      process.exit(1);
    }
  }

  await conn.end();
  console.log(count === 0 ? 'Database already up to date.' : `Applied ${count} migration(s).`);
}

run().catch((err) => {
  console.error('Migration runner crashed:', err);
  process.exit(1);
});
