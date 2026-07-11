import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import {
  listNotifications,
  markRead,
  unreadCount,
  generateForTenant,
} from '../services/notifications.service';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  wrap(async (req, res) => {
    res.json({
      unread: await unreadCount(req.auth!.tenantId),
      items: await listNotifications(req.auth!.tenantId),
    });
  }),
);

notificationsRouter.post(
  '/read',
  wrap(async (req, res) => {
    const id = req.body?.id ? Number(req.body.id) : undefined;
    await markRead(req.auth!.tenantId, id);
    res.json({ ok: true });
  }),
);

// Re-evaluate compliance and create any new reminders (also run by the daily
// scheduler; exposed here so the user can refresh on demand).
notificationsRouter.post(
  '/generate',
  wrap(async (req, res) => {
    const created = await generateForTenant(req.auth!.tenantId);
    res.json({ created, unread: await unreadCount(req.auth!.tenantId) });
  }),
);
