import { pool } from '../db/pool';
import { decryptSecret, encryptSecret, KEY_VERSION } from '../utils/crypto';
import { CertError, loadP12, type FiscalCert } from './cert';

// Per-tenant certificate storage. Decrypted certs are cached in memory for the lifetime of
// the process — parsing a .p12 on every invoice would be wasteful, and the key material is
// already in this process's memory the moment we sign anything.

const cache = new Map<number, { cert: FiscalCert; environment: 'test' | 'prod' }>();

// p12_ct is VARBINARY(16384). A real .p12 is 2–4 KB; anything near the column limit would
// fail inside MySQL and reach the user as a 500, so it is rejected up front instead.
const MAX_P12_BYTES = 12 * 1024;

export interface CertView {
  configured: boolean;
  filename: string | null;
  environment: 'test' | 'prod';
  subject_oib: string | null;
  valid_from: string | null;
  valid_to: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  expired: boolean;
}

export async function getCertView(tenantId: number): Promise<CertView> {
  const [[row]] = await pool.query<any[]>(
    `SELECT filename, environment, subject_oib, valid_from, valid_to, last_verified_at, last_error
     FROM fiscal_certificates WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (!row) {
    return {
      configured: false,
      filename: null,
      environment: 'test',
      subject_oib: null,
      valid_from: null,
      valid_to: null,
      last_verified_at: null,
      last_error: null,
      expired: false,
    };
  }
  return {
    configured: true,
    ...row,
    expired: row.valid_to ? new Date(row.valid_to) < new Date() : false,
  };
}

/**
 * Parses and stores a .p12. Parsing happens BEFORE the write, so a wrong password or a
 * certificate without an OIB is rejected while the user is still looking at the form,
 * rather than surfacing later as an s005 on a real invoice.
 */
export async function saveCertificate(
  tenantId: number,
  p12: Buffer,
  password: string,
  environment: 'test' | 'prod',
  filename: string | null,
): Promise<FiscalCert> {
  if (p12.length > MAX_P12_BYTES) {
    throw new CertError(
      'Datoteka certifikata je prevelika (najviše 12 KB). Provjerite jeste li odabrali .p12 datoteku.',
    );
  }

  const cert = loadP12(p12, password);

  if (!cert.oib) {
    throw new CertError(
      'Certifikat ne sadrži OIB. Za fiskalizaciju je potreban napredni certifikat koji sadrži OIB (organizationIdentifier).',
    );
  }

  const [[profile]] = await pool.query<any[]>(
    `SELECT oib FROM business_profiles WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (profile?.oib && profile.oib !== cert.oib) {
    // The authority rejects this with s005; catching it here is far kinder than letting a
    // real invoice fail after it has already been handed to a customer.
    throw new CertError(
      `OIB u certifikatu (${cert.oib}) ne odgovara OIB-u obrta (${profile.oib}). Fiskalizacija bi bila odbijena.`,
    );
  }

  const blob = encryptSecret(p12.toString('base64'));
  const pw = encryptSecret(password);

  await pool.query(
    `INSERT INTO fiscal_certificates
       (tenant_id, filename, p12_ct, p12_iv, p12_tag, password_ct, password_iv, password_tag,
        key_version, environment, subject_oib, valid_from, valid_to, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       filename = VALUES(filename), p12_ct = VALUES(p12_ct), p12_iv = VALUES(p12_iv),
       p12_tag = VALUES(p12_tag), password_ct = VALUES(password_ct),
       password_iv = VALUES(password_iv), password_tag = VALUES(password_tag),
       key_version = VALUES(key_version), environment = VALUES(environment),
       subject_oib = VALUES(subject_oib), valid_from = VALUES(valid_from),
       valid_to = VALUES(valid_to), last_error = NULL`,
    [
      tenantId, filename, blob.ct, blob.iv, blob.tag, pw.ct, pw.iv, pw.tag,
      KEY_VERSION, environment, cert.oib,
      cert.validFrom, cert.validTo,
    ],
  );

  cache.set(tenantId, { cert, environment });
  return cert;
}

// The certificate only proves itself when the authority accepts a signature made with it.
// These two mirror that verdict onto the Settings screen, so a rejected certificate is
// visible where it can actually be replaced — not only on the invoice that failed.
export async function markCertVerified(tenantId: number): Promise<void> {
  await pool.query(
    `UPDATE fiscal_certificates SET last_verified_at = NOW(), last_error = NULL WHERE tenant_id = ?`,
    [tenantId],
  );
}

export async function markCertError(tenantId: number, message: string): Promise<void> {
  await pool.query(`UPDATE fiscal_certificates SET last_error = ? WHERE tenant_id = ?`, [
    message.slice(0, 500),
    tenantId,
  ]);
}

export async function deleteCertificate(tenantId: number): Promise<void> {
  await pool.query(`DELETE FROM fiscal_certificates WHERE tenant_id = ?`, [tenantId]);
  cache.delete(tenantId);
}

export async function loadCertificate(
  tenantId: number,
): Promise<{ cert: FiscalCert; environment: 'test' | 'prod' } | null> {
  const hit = cache.get(tenantId);
  if (hit) return hit;

  const [[row]] = await pool.query<any[]>(
    `SELECT p12_ct, p12_iv, p12_tag, password_ct, password_iv, password_tag, environment
     FROM fiscal_certificates WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (!row) return null;

  const p12 = Buffer.from(
    decryptSecret(row.p12_ct, row.p12_iv, row.p12_tag),
    'base64',
  );
  const password = decryptSecret(row.password_ct, row.password_iv, row.password_tag);

  const entry = { cert: loadP12(p12, password), environment: row.environment as 'test' | 'prod' };
  cache.set(tenantId, entry);
  return entry;
}
