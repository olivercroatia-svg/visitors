import { pool } from '../db/pool';
import { isValidOib } from '../utils/oib';

export interface OnboardingStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  required: boolean; // required steps gate invoice issuance
  href: string; // where the client should send the user to fix it
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  canIssueInvoices: boolean;
  missingRequired: string[];
}

// Single source of truth for "is this tenant allowed to issue invoices yet".
// Both the dashboard checklist and the invoice-creation gate read this, so the
// rule can never drift between the two surfaces.
export async function getOnboardingStatus(tenantId: number): Promise<OnboardingStatus> {
  const [[profile]] = await pool.query<any[]>(
    `SELECT oib, address, city, postal_code FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  const [[counts]] = await pool.query<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM premises WHERE tenant_id = ? AND active = 1) AS premises,
       (SELECT COUNT(*) FROM devices  WHERE tenant_id = ? AND active = 1) AS devices,
       (SELECT COUNT(*) FROM services WHERE tenant_id = ? AND active = 1) AS services`,
    [tenantId, tenantId, tenantId],
  );

  const hasValidOib = Boolean(profile?.oib && isValidOib(profile.oib));
  const hasAddress = Boolean(profile?.address && profile?.city && profile?.postal_code);

  const steps: OnboardingStep[] = [
    {
      key: 'account',
      label: 'Osnovni podaci o računu',
      hint: 'Ime, email i naziv djelatnosti.',
      done: true,
      required: false,
      href: '/postavke?tab=obrt',
    },
    {
      key: 'oib',
      label: 'OIB obrta / iznajmljivača',
      hint: 'Ispravan 11-znamenkasti OIB nužan je za svaki račun.',
      done: hasValidOib,
      required: true,
      href: '/postavke?tab=obrt',
    },
    {
      key: 'address',
      label: 'Adresa i mjesto poslovanja',
      hint: 'Sjedište koje se ispisuje na računu.',
      done: hasAddress,
      required: true,
      href: '/postavke?tab=obrt',
    },
    {
      key: 'premise',
      label: 'Poslovni prostor',
      hint: 'Barem jedan prostor s oznakom (npr. POSL1).',
      done: Number(counts?.premises ?? 0) > 0,
      required: true,
      href: '/postavke?tab=prostori',
    },
    {
      key: 'device',
      label: 'Naplatni uređaj',
      hint: 'Barem jedan uređaj (oznaka se koristi u broju računa).',
      done: Number(counts?.devices ?? 0) > 0,
      required: true,
      href: '/postavke?tab=prostori',
    },
    {
      key: 'service',
      label: 'Barem jedna usluga',
      hint: 'Npr. „Noćenje" — ubrzava unos računa.',
      done: Number(counts?.services ?? 0) > 0,
      required: false,
      href: '/postavke?tab=usluge',
    },
  ];

  const missingRequired = steps.filter((s) => s.required && !s.done).map((s) => s.key);

  return {
    steps,
    canIssueInvoices: missingRequired.length === 0,
    missingRequired,
  };
}
