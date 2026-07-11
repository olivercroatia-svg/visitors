import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { env } from '../config/env';
import type { AuthContext, ProfileType, UserRow, VatStatus } from '../types';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  businessName: string;
  profileType: ProfileType;
  vatStatus: VatStatus;
}

export function signToken(ctx: AuthContext): string {
  return jwt.sign(ctx, env.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & AuthContext;
    if (typeof decoded.userId !== 'number' || typeof decoded.tenantId !== 'number') {
      return null;
    }
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      platformRole: decoded.platformRole === 'admin' ? 'admin' : 'user',
    };
  } catch {
    return null;
  }
}

export async function emailExists(email: string): Promise<boolean> {
  const [rows] = await pool.query<any[]>('SELECT id FROM users WHERE email = ? LIMIT 1', [
    email.toLowerCase(),
  ]);
  return rows.length > 0;
}

// Creates a tenant, its owner user, and a stub business profile in one
// transaction. On first VAT-obveznik registration we also stamp the initial
// status change so the effective-dated history is never empty.
export async function registerTenant(input: RegisterInput): Promise<{ ctx: AuthContext; user: UserRow }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [tenantResult] = await conn.query<any>(
      'INSERT INTO tenants (name) VALUES (?)',
      [input.businessName],
    );
    const tenantId = tenantResult.insertId as number;

    const passwordHash = await bcrypt.hash(input.password, 12);
    const [userResult] = await conn.query<any>(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, tenant_role, platform_role)
       VALUES (?, ?, ?, ?, 'owner', 'user')`,
      [tenantId, input.email.toLowerCase(), passwordHash, input.fullName],
    );
    const userId = userResult.insertId as number;

    await conn.query(
      `INSERT INTO business_profiles (tenant_id, type, legal_name, vat_status)
       VALUES (?, ?, ?, ?)`,
      [tenantId, input.profileType, input.businessName, input.vatStatus],
    );

    if (input.vatStatus === 'obveznik') {
      await conn.query(
        `INSERT INTO vat_status_changes (tenant_id, from_status, to_status, effective_date, reason, created_by)
         VALUES (?, NULL, 'obveznik', CURDATE(), 'Status pri registraciji', ?)`,
        [tenantId, userId],
      );
    }

    await conn.commit();

    const ctx: AuthContext = { userId, tenantId, platformRole: 'user' };
    const user: UserRow = {
      id: userId,
      tenant_id: tenantId,
      email: input.email.toLowerCase(),
      full_name: input.fullName,
      tenant_role: 'owner',
      platform_role: 'user',
      last_login_at: null,
    };
    return { ctx, user };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ ctx: AuthContext; user: UserRow } | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, email, password_hash, full_name, tenant_role, platform_role, last_login_at
     FROM users WHERE email = ? LIMIT 1`,
    [email.toLowerCase()],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);

  const ctx: AuthContext = {
    userId: row.id,
    tenantId: row.tenant_id,
    platformRole: row.platform_role,
  };
  const user: UserRow = {
    id: row.id,
    tenant_id: row.tenant_id,
    email: row.email,
    full_name: row.full_name,
    tenant_role: row.tenant_role,
    platform_role: row.platform_role,
    last_login_at: row.last_login_at,
  };
  return { ctx, user };
}

export async function getUserWithProfile(userId: number): Promise<{ user: UserRow; profile: any } | null> {
  const [users] = await pool.query<any[]>(
    `SELECT id, tenant_id, email, full_name, tenant_role, platform_role, last_login_at
     FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  if (users.length === 0) return null;
  const user = users[0] as UserRow;

  const [profiles] = await pool.query<any[]>(
    `SELECT id, tenant_id, type, legal_name, oib, address, city, postal_code, iban, vat_status, onboarding_completed
     FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [user.tenant_id],
  );

  return { user, profile: profiles[0] ?? null };
}
