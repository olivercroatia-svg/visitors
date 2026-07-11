import { pool } from '../db/pool';
import { getUpcomingObligations, daysUntil, CALENDAR_DISCLAIMER } from './taxCalendar.service';
import { getPendingVatChange } from './vat.service';
import { getOnboardingStatus } from './onboarding.service';

export type SemaforLevel = 'ok' | 'warning' | 'danger';

export interface ComplianceIssue {
  severity: 'warning' | 'danger';
  title: string;
  detail: string;
  link?: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function getComplianceOverview(tenantId: number) {
  const [[profile]] = await pool.query<any[]>(
    `SELECT type, vat_status, uses_foreign_platforms, has_vat_id, beds_count, flat_tax_per_bed_eur
     FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  const profileType = profile?.type ?? 'privatni_iznajmljivac';
  const vatStatus = profile?.vat_status ?? 'nije_obveznik';

  // Threshold + settings
  const [settingsRows] = await pool.query<any[]>(
    `SELECT setting_key, setting_value FROM platform_settings
     WHERE setting_key IN ('pdv_threshold_eur','pdv_threshold_warn_levels')`,
  );
  const sMap = new Map(settingsRows.map((r) => [r.setting_key, r.setting_value]));
  const threshold = Number(sMap.get('pdv_threshold_eur') ?? 60000);
  const warnLevels: number[] = JSON.parse(sMap.get('pdv_threshold_warn_levels') ?? '[70,85,95]');

  // Revenue YTD + day-of-year (from DB for TZ consistency)
  const [[rev]] = await pool.query<any[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN status='issued' AND doc_type='invoice' AND YEAR(issue_date)=YEAR(CURDATE())
                         THEN total ELSE 0 END),0) AS revenue_ytd,
       DAYOFYEAR(CURDATE()) AS doy,
       DAYOFYEAR(CONCAT(YEAR(CURDATE()),'-12-31')) AS diy,
       CURDATE() AS today
     FROM invoices WHERE tenant_id = ?`,
    [tenantId],
  );
  const revenue = Number(rev.revenue_ytd);
  const today = String(rev.today);
  const doy = Number(rev.doy);
  const diy = Number(rev.diy);

  const pct = threshold > 0 ? Math.round((revenue / threshold) * 100) : 0;
  const warnLevel = [...warnLevels].reverse().find((l) => pct >= l) ?? 0;

  // Linear projection to year-end + estimated crossing date.
  const dailyRate = doy > 0 ? revenue / doy : 0;
  const projectedYearEnd = round2(dailyRate * diy);
  let projectedCrossDate: string | null = null;
  if (revenue < threshold && dailyRate > 0 && projectedYearEnd >= threshold) {
    const daysToThreshold = Math.ceil((threshold - revenue) / dailyRate);
    if (doy + daysToThreshold <= diy) {
      const d = new Date(Date.UTC(Number(today.slice(0, 4)), 0, 1));
      d.setUTCDate(d.getUTCDate() + doy - 1 + daysToThreshold);
      projectedCrossDate = d.toISOString().slice(0, 10);
    }
  }

  // Reverse-charge guard (EU platform commissions -> PDV-ID obligation).
  const usesForeign = Boolean(profile?.uses_foreign_platforms);
  const hasVatId = Boolean(profile?.has_vat_id);
  const reverseChargeWarning = usesForeign && !hasVatId;

  const pendingVatChange = await getPendingVatChange(tenantId);

  const [[fiscal]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS pending FROM invoices WHERE tenant_id = ? AND fiscal_status = 'pending'`,
    [tenantId],
  );
  const pendingFiscal = Number(fiscal.pending);

  const onboarding = await getOnboardingStatus(tenantId);

  // Upcoming obligations with countdown.
  const obligations = getUpcomingObligations(profileType, vatStatus, today, 120).map((o) => ({
    ...o,
    days_until: daysUntil(o.due_date, today),
  }));

  // Build the issues list + overall level.
  const issues: ComplianceIssue[] = [];
  if (pct >= 95) {
    issues.push({
      severity: 'danger',
      title: 'Blizu ste praga PDV-a',
      detail: `Promet je na ${pct}% praga od ${threshold.toLocaleString('hr-HR')} €. Prelazak znači ulazak u sustav PDV-a.`,
      link: '/obveze',
    });
  } else if (pct >= (warnLevels[1] ?? 85)) {
    issues.push({
      severity: 'warning',
      title: 'Promet raste prema pragu PDV-a',
      detail: `Promet je na ${pct}% praga${projectedCrossDate ? `. Ovim tempom prag prelazite oko ${fmt(projectedCrossDate)}.` : '.'}`,
      link: '/obveze',
    });
  }
  if (reverseChargeWarning) {
    issues.push({
      severity: 'danger',
      title: 'Provizije stranim platformama bez PDV ID-a',
      detail:
        'Ako plaćate proviziju Bookingu/Airbnbu, obično trebate PDV ID broj i obračun 25% PDV-a na proviziju (mjesečni PDV i PDV-S obrasci).',
      link: '/obveze',
    });
  }
  if (pendingFiscal > 0) {
    issues.push({
      severity: 'warning',
      title: `${pendingFiscal} ${pendingFiscal === 1 ? 'račun' : 'računa'} čeka fiskalizaciju`,
      detail: 'Pokrenite naknadnu fiskalizaciju prije isteka roka.',
      link: '/racuni?status=issued',
    });
  }
  if (!onboarding.canIssueInvoices) {
    issues.push({
      severity: 'warning',
      title: 'Profil nije potpun',
      detail: 'Dovršite obavezne podatke da biste mogli izdavati račune.',
      link: '/postavke',
    });
  }
  const soon = obligations.find((o) => o.days_until >= 0 && o.days_until <= 7);
  if (soon) {
    issues.push({
      severity: 'warning',
      title: `Uskoro: ${soon.title}`,
      detail: `Rok ${fmt(soon.due_date)} (za ${soon.days_until} ${soon.days_until === 1 ? 'dan' : 'dana'}).`,
      link: '/obveze',
    });
  }

  const level: SemaforLevel = issues.some((i) => i.severity === 'danger')
    ? 'danger'
    : issues.length > 0
      ? 'warning'
      : 'ok';

  const [[notif]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c FROM notifications WHERE tenant_id = ? AND is_read = 0`,
    [tenantId],
  );

  return {
    level,
    issues,
    threshold: {
      value: threshold,
      revenue_ytd: revenue,
      pct,
      warn_level: warnLevel,
      projected_year_end: projectedYearEnd,
      projected_cross_date: projectedCrossDate,
    },
    vat: { status: vatStatus, pending_change: pendingVatChange },
    reverse_charge: { uses_foreign_platforms: usesForeign, has_vat_id: hasVatId, warning: reverseChargeWarning },
    profile: {
      type: profileType,
      beds_count: profile?.beds_count ?? null,
      flat_tax_per_bed_eur: profile?.flat_tax_per_bed_eur != null ? Number(profile.flat_tax_per_bed_eur) : null,
    },
    obligations,
    calendar_disclaimer: CALENDAR_DISCLAIMER,
    unread_notifications: Number(notif.c),
  };
}

function fmt(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}.`;
}
