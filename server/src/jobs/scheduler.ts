import { applyDueVatChanges } from '../services/vat.service';
import { generateForAllTenants } from '../services/notifications.service';

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

export function startScheduler(): void {
  // First run shortly after boot, then every 6 hours.
  setTimeout(tick, 15_000);
  setInterval(tick, SIX_HOURS);
}
