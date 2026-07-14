import type { Pool, PoolConnection } from 'mysql2/promise';
import { pool } from '../db/pool';

// Foreign keys arrive from the client as bare integers, and MySQL's FKs only prove the row
// exists — not that it belongs to the caller's tenant. Anything a request hands us that
// points at a tenant-owned table has to be checked here before it is stored, or a tenant can
// attach another tenant's premise, device or guest to its own record and read it back.
//
// Takes an optional connection so a check can run inside the caller's transaction.
async function owns(
  table: 'premises' | 'guests' | 'accommodation_objects',
  tenantId: number,
  id: number,
  conn: Pool | PoolConnection = pool,
): Promise<boolean> {
  const [rows] = await conn.query<any[]>(
    `SELECT id FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  return rows.length > 0;
}

export const ownsPremise = (tenantId: number, id: number, conn?: Pool | PoolConnection) =>
  owns('premises', tenantId, id, conn);

export const ownsGuest = (tenantId: number, id: number, conn?: Pool | PoolConnection) =>
  owns('guests', tenantId, id, conn);

// A device always lives in exactly one premise (devices.premise_id is NOT NULL), and the pair
// is what the invoice number is built from: N/<premise.code>/<device.code>. Checking only that
// both belong to the tenant is not enough — device codes are unique per premise, so premise A
// and premise B can each hold a device coded "1". An invoice pairing premise A with B's device
// draws from its own invoice_sequences row and prints the SAME number as the legitimate pair,
// which the id-based uq_invoice_number cannot catch. So ownership of a device is only ever a
// question about a (device, premise) pair.
export async function deviceInPremise(
  tenantId: number,
  deviceId: number,
  premiseId: number,
  conn: Pool | PoolConnection = pool,
): Promise<boolean> {
  const [rows] = await conn.query<any[]>(
    `SELECT id FROM devices WHERE id = ? AND tenant_id = ? AND premise_id = ? LIMIT 1`,
    [deviceId, tenantId, premiseId],
  );
  return rows.length > 0;
}

export const ownsObject = (tenantId: number, id: number, conn?: Pool | PoolConnection) =>
  owns('accommodation_objects', tenantId, id, conn);
