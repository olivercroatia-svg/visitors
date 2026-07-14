export type PlatformRole = 'user' | 'admin';
export type TenantRole = 'owner' | 'member';
export type ProfileType = 'privatni_iznajmljivac' | 'pausalni_obrt';
export type VatStatus = 'nije_obveznik' | 'obveznik';

export interface AuthContext {
  userId: number;
  tenantId: number;
  platformRole: PlatformRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export interface UserRow {
  id: number;
  tenant_id: number;
  email: string;
  full_name: string;
  tenant_role: TenantRole;
  platform_role: PlatformRole;
  last_login_at: string | null;
  // OibOper on the fiscal message — the OIB of the person issuing the invoice. Null
  // means "same as the business", which is the normal case for a one-person obrt.
  oib: string | null;
}

export interface BusinessProfileRow {
  id: number;
  tenant_id: number;
  type: ProfileType;
  legal_name: string | null;
  oib: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  iban: string | null;
  vat_status: VatStatus;
  onboarding_completed: number;
}
