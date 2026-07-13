import { Router } from 'express';
import { authRouter } from './auth.routes';
import { metaRouter } from './meta.routes';
import { profileRouter } from './profile.routes';
import { premisesRouter } from './premises.routes';
import { devicesRouter } from './devices.routes';
import { servicesRouter } from './services.routes';
import { guestsRouter } from './guests.routes';
import { companiesRouter } from './companies.routes';
import { municipalitiesRouter } from './municipalities.routes';
import { invoicesRouter } from './invoices.routes';
import { complianceRouter } from './compliance.routes';
import { kprRouter } from './kpr.routes';
import { notificationsRouter } from './notifications.routes';
import { analyticsRouter } from './analytics.routes';
import { adminRouter } from './admin.routes';
import { fiscalRouter } from './fiscal.routes';
import { objectsRouter } from './objects.routes';
import { staysRouter } from './stays.routes';
import { evisitorRouter } from './evisitor.routes';
import { ping } from '../db/pool';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  try {
    await ping();
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/meta', metaRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/premises', premisesRouter);
apiRouter.use('/devices', devicesRouter);
apiRouter.use('/services', servicesRouter);
apiRouter.use('/guests', guestsRouter);
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/municipalities', municipalitiesRouter);
apiRouter.use('/invoices', invoicesRouter);
apiRouter.use('/compliance', complianceRouter);
apiRouter.use('/kpr', kprRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/fiscal', fiscalRouter);
apiRouter.use('/objects', objectsRouter);
apiRouter.use('/stays', staysRouter);
apiRouter.use('/evisitor', evisitorRouter);
apiRouter.use('/admin', adminRouter);
