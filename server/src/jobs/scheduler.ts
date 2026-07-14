import { env } from '../config/env';
import { applyDueVatChanges } from '../services/vat.service';
import { generateForAllTenants } from '../services/notifications.service';
import { drainEVisitorQueue } from '../services/evisitor.service';
import { drainFiscalQueue } from '../services/invoice.service';

// Lightweight in-process daily scheduler. Applies due VAT-status transitions
// and generates deadline/threshold reminders. (For production scale this would
// move to a real cron / queue; fine for the current single-node deployment.)
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function tick(): Promise<void> {
  try {
    const flipped = await applyDueVatChanges();
    if (flipped > 0) console.log(`[scheduler] applied ${flipped} due VAT status change(s)`);
    await generateForAllTenants();
  } catch (err) {
    console.error('[scheduler] tick failed', err);
  }
}

// eVisitor gets its own, much faster tick: a check-in or check-out has to reach the
// authority within 24h (ch. 4.4.3), and the 6h tick above could eat a quarter of that
// window on its own.
let draining = false;

async function queueTick(): Promise<void> {
  if (draining) return; // a slow drain must not overlap with the next interval
  draining = true;
  try {
    const sent = await drainEVisitorQueue();
    if (sent > 0) console.log(`[scheduler] drained ${sent} eVisitor request(s)`);
  } catch (err) {
    console.error('[scheduler] eVisitor drain failed', err);
  } finally {
    draining = false;
  }
}

// Fiscalization gets its own guard rather than sharing eVisitor's: a slow eVisitor drain
// must not hold back invoices that are burning through the naknadna-dostava window.
let drainingFiscal = false;

async function fiscalQueueTick(): Promise<void> {
  if (drainingFiscal) return;
  drainingFiscal = true;
  try {
    const sent = await drainFiscalQueue();
    if (sent > 0) console.log(`[scheduler] drained ${sent} fiscal request(s)`);
  } catch (err) {
    console.error('[scheduler] fiscal drain failed', err);
  } finally {
    drainingFiscal = false;
  }
}

export function startScheduler(): void {
  // First run shortly after boot, then every 6 hours.
  setTimeout(tick, 15_000);
  setInterval(tick, SIX_HOURS);

  const queueInterval = Math.max(1, env.evisitorQueueIntervalMin) * 60 * 1000;
  setTimeout(queueTick, 30_000);
  setInterval(queueTick, queueInterval);

  // Staggered from the eVisitor drain so the two do not hit the DB together on every boot.
  const fiscalInterval = Math.max(1, env.fiscalQueueIntervalMin) * 60 * 1000;
  setTimeout(fiscalQueueTick, 45_000);
  setInterval(fiscalQueueTick, fiscalInterval);
}
