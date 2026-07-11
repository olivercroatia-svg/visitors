import dotenv from 'dotenv';
import path from 'path';

// Load server/.env regardless of process cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  jwtSecret: required('JWT_SECRET', 'dev-secret-visitors-local-only'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  fiscalProvider: process.env.FISCAL_PROVIDER ?? 'mock',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'visitors_dev',
  },
} as const;

export const AUTH_COOKIE = 'visitors_session';
