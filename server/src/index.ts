import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middleware/error';
import { startScheduler } from './jobs/scheduler';
import { ping } from './db/pool';

const app = express();

// Behind Nginx on the VPS — makes req.ip the real client, which the auth rate limiter needs.
app.set('trust proxy', 1);
// The API only ever answers JSON, so the interesting headers here are nosniff, frameguard,
// HSTS and a stripped X-Powered-By. CSP is left at helmet's default; it costs nothing on a
// JSON response and is correct if this ever serves anything else.
app.use(helmet());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);
// Document scanning posts 1–3 base64 photos, which 1mb refuses. body-parser marks the request
// once it has parsed it and later parsers skip it, so mounting the wider limit FIRST — and only
// on this path — raises the ceiling for scanning without loosening it anywhere else. The limit
// that actually protects us is per-image, after decoding, inside the route.
app.use('/api/guests/scan', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api', apiRouter);

app.use(notFound);
app.use(errorHandler);

async function start(): Promise<void> {
  try {
    await ping();
    console.log(`[db] connected to ${env.db.database}@${env.db.host}:${env.db.port}`);
  } catch (err) {
    console.warn('[db] could not connect at startup — did you run migrations?', (err as Error).message);
  }
  app.listen(env.port, () => {
    console.log(`[server] Visitors API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    startScheduler();
  });
}

start();
