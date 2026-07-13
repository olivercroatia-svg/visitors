import { CODEBOOK_RESOURCES, TT_CATEGORY_AGE_RULES } from './codebooks';
import type {
  CodebookEntry,
  CodebookKind,
  EVisitorCheckIn,
  EVisitorCheckOut,
  EVisitorCredentials,
  EVisitorFacility,
  EVisitorMessage,
  EVisitorProvider,
  EVisitorResult,
} from './types';
import { buildCheckInXml, buildCheckOutXml } from './xml';

// Real adapter for the HTZ eVisitor REST API (Rhetos). Node's global fetch — no HTTP
// dependency needed.
//
// Three things here are easy to get wrong and expensive to get wrong:
//
//  1. Login returns THREE cookies (authentication, affinity, language) and ALL of them
//     must be echoed on every call. `affinity` is load-balancer stickiness: drop it and
//     calls fail intermittently in a way that looks like a server bug.
//  2. SUCCESS IS AN EMPTY BODY. A 200 with a body is a FAILURE carrying a Croatian
//     system message. Treating "200" as success would silently swallow every rejection.
//  3. A business rejection must not be retried (see `classify`).

const SESSION_TTL_MS = 20 * 60 * 1000; // ASP.NET forms auth defaults to a 30-min sliding window
const REQUEST_TIMEOUT_MS = 30_000;

interface Session {
  cookie: string;
  at: number;
}

const sessions = new Map<string, Session>();

class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransportError';
  }
}

class AuthExpiredError extends Error {}

export class HttpProvider implements EVisitorProvider {
  readonly name = 'http';

  async verifyCredentials(creds: EVisitorCredentials): Promise<EVisitorResult> {
    try {
      const cookie = await login(creds);
      await logout(creds, cookie);
      sessions.delete(sessionKey(creds));
      return { status: 'confirmed', retryable: false, messages: [] };
    } catch (err) {
      return toResult(err);
    }
  }

  async checkIn(creds: EVisitorCredentials, items: EVisitorCheckIn[]): Promise<EVisitorResult> {
    return this.action(creds, 'ImportTourists/', {
      Xml: buildCheckInXml(items),
      Register: true,
    });
  }

  async checkOut(creds: EVisitorCredentials, items: EVisitorCheckOut[]): Promise<EVisitorResult> {
    return this.action(creds, 'ImportTouristCheckOut/', { Xml: buildCheckOutXml(items) });
  }

  async cancel(creds: EVisitorCredentials, id: string): Promise<EVisitorResult> {
    return this.action(creds, 'CancelTouristCheckIn', { ID: id });
  }

  async fetchCodebook(creds: EVisitorCredentials, kind: CodebookKind): Promise<CodebookEntry[]> {
    const rows = await withSession(creds, (cookie) =>
      restGet(creds, `${CODEBOOK_RESOURCES[kind]}/`, cookie),
    );
    return rows.map((row) => mapCodebookRow(kind, row)).filter((e): e is CodebookEntry => e !== null);
  }

  async fetchFacilities(creds: EVisitorCredentials): Promise<EVisitorFacility[]> {
    const rows = await withSession(creds, (cookie) => restGet(creds, 'FacilityBrowse/', cookie));
    return rows
      .map((row) => ({
        facilityCode: str(row.Code ?? row.FacilityCode),
        name: str(row.Name ?? row.FacilityName) || str(row.Code),
      }))
      .filter((f) => f.facilityCode !== '');
  }

  private async action(
    creds: EVisitorCredentials,
    resource: string,
    body: unknown,
  ): Promise<EVisitorResult> {
    try {
      await withSession(creds, async (cookie) => {
        const res = await request(`${restUrl(creds)}${resource}`, {
          method: 'POST',
          cookie,
          body: JSON.stringify(body),
        });
        const text = (await res.text()).trim();

        if (res.status === 401 || res.status === 403) throw new AuthExpiredError();

        // Point 2: an action succeeds only with 200 AND an empty body.
        if (res.status === 200 && text === '') return [];

        if (res.status >= 500 || res.status === 408 || res.status === 429) {
          throw new TransportError(text || `eVisitor je vratio grešku ${res.status}.`);
        }
        throw new BusinessError(parseMessages(text), text);
      });
      return { status: 'confirmed', retryable: false, messages: [] };
    } catch (err) {
      return toResult(err);
    }
  }
}

class BusinessError extends Error {
  constructor(readonly messages: EVisitorMessage[], readonly raw: string) {
    super(messages[0]?.text ?? 'eVisitor je odbio zahtjev.');
    this.name = 'BusinessError';
  }
}

function sessionKey(creds: EVisitorCredentials): string {
  return `${creds.baseUrl}|${creds.username}`;
}

function restUrl(creds: EVisitorCredentials): string {
  return `${creds.baseUrl.replace(/\/+$/, '')}/Rest/Htz/`;
}

function authUrl(creds: EVisitorCredentials): string {
  return `${creds.baseUrl.replace(/\/+$/, '')}/Resources/AspNetFormsAuth/Authentication/`;
}

async function request(
  url: string,
  opts: { method: string; cookie?: string; body?: string },
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (opts.cookie) headers.Cookie = opts.cookie;

  try {
    return await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Network-level failure: unreachable, DNS, TLS, timeout. Always worth retrying.
    throw new TransportError(
      err instanceof Error ? `Nije moguće spojiti se na eVisitor: ${err.message}` : 'Nije moguće spojiti se na eVisitor.',
    );
  }
}

async function login(creds: EVisitorCredentials): Promise<string> {
  const res = await request(`${authUrl(creds)}Login`, {
    method: 'POST',
    body: JSON.stringify({
      userName: creds.username,
      password: creds.password,
      persistCookie: false,
      ...(creds.apikey ? { apikey: creds.apikey } : {}),
    }),
  });

  const text = (await res.text()).trim();

  if (res.status >= 500) throw new TransportError(`eVisitor prijava: greška ${res.status}.`);

  // Point 1: keep every cookie the login handed us, not just the auth one.
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  if (res.status !== 200 || text.toLowerCase() === 'false' || !cookie) {
    const messages = parseMessages(text);
    throw new BusinessError(
      messages.length > 0
        ? messages
        : [{ severity: 'error', text: 'Neispravno korisničko ime, lozinka ili API ključ.' }],
      text,
    );
  }

  return cookie;
}

async function logout(creds: EVisitorCredentials, cookie: string): Promise<void> {
  try {
    await request(`${authUrl(creds)}Logout`, { method: 'POST', cookie, body: '' });
  } catch {
    // A failed logout is harmless — the session just expires on its own.
  }
}

// Runs `fn` with a live session, re-logging in once if the cached cookie has expired.
async function withSession<T>(
  creds: EVisitorCredentials,
  fn: (cookie: string) => Promise<T>,
): Promise<T> {
  const key = sessionKey(creds);
  const cached = sessions.get(key);
  let cookie: string;

  if (cached && Date.now() - cached.at < SESSION_TTL_MS) {
    cookie = cached.cookie;
  } else {
    cookie = await login(creds);
    sessions.set(key, { cookie, at: Date.now() });
  }

  try {
    return await fn(cookie);
  } catch (err) {
    if (!(err instanceof AuthExpiredError)) throw err;
    sessions.delete(key);
    const fresh = await login(creds);
    sessions.set(key, { cookie: fresh, at: Date.now() });
    return fn(fresh);
  }
}

async function restGet(
  creds: EVisitorCredentials,
  resource: string,
  cookie: string,
): Promise<Record<string, any>[]> {
  const res = await request(`${restUrl(creds)}${resource}`, { method: 'GET', cookie });
  if (res.status === 401 || res.status === 403) throw new AuthExpiredError();

  const text = await res.text();
  if (res.status !== 200) {
    if (res.status >= 500) throw new TransportError(`eVisitor je vratio grešku ${res.status}.`);
    throw new BusinessError(parseMessages(text), text);
  }

  const parsed = safeJson(text);
  // Rhetos wraps collections in { Records: [...] }; some resources return a bare array.
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.Records)) return parsed.Records;
  return [];
}

// eVisitor reports problems as {"UserMessage": ..., "SystemMessage": ...}. UserMessage is
// the one written for the landlord; SystemMessage is the technical one. Ch. 4.4.6 requires
// both to reach the user, so we keep whatever we get, verbatim.
function parseMessages(body: string): EVisitorMessage[] {
  const text = body.trim();
  if (text === '') return [];

  const parsed = safeJson(text);
  if (parsed) {
    const out: EVisitorMessage[] = [];
    if (typeof parsed.UserMessage === 'string' && parsed.UserMessage.trim() !== '') {
      out.push({ severity: 'error', text: parsed.UserMessage.trim() });
    }
    if (typeof parsed.SystemMessage === 'string' && parsed.SystemMessage.trim() !== '') {
      out.push({ severity: 'error', text: parsed.SystemMessage.trim() });
    }
    if (out.length > 0) return out;
  }

  return [{ severity: 'error', text: text.slice(0, 1000) }];
}

function safeJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Point 3. Retrying a business rejection can never succeed: it just hammers eVisitor and
// hides a problem only the landlord can fix. Retrying a timeout, on the other hand, is
// exactly the right move.
function toResult(err: unknown): EVisitorResult {
  if (err instanceof BusinessError) {
    const idempotent = err.messages.some((m) => /već postoji prijava sa zadanim id/i.test(m.text));
    if (idempotent) {
      // Our call timed out AFTER eVisitor had already committed the prijava, and the retry
      // re-sent the same GUID. The registration exists and is ours, so this is success.
      return { status: 'confirmed', retryable: false, messages: [], raw: err.raw };
    }
    return {
      status: 'failed',
      retryable: false,
      error: err.message,
      messages: err.messages,
      raw: err.raw,
    };
  }

  const message =
    err instanceof Error ? err.message : 'Nepoznata greška u komunikaciji sa sustavom eVisitor.';
  return {
    status: 'failed',
    retryable: true,
    error: message,
    messages: [{ severity: 'error', text: message }],
  };
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

function mapCodebookRow(kind: CodebookKind, row: Record<string, any>): CodebookEntry | null {
  // Rhetos lookups are not uniform: countries carry ISO codes, most others a `Code`, and
  // arrival organisation exposes the MUP code. Take the first field that actually exists.
  const code =
    kind === 'country'
      ? str(row.CodeThreeLetters)
      : str(row.Code ?? row.CodeMI ?? row.CodeNames ?? row.ID);

  const label =
    str(row.Name ?? row.NameNational ?? row.NameCitizenships ?? row.AlternativeName) || code;

  if (code === '') return null;
  if (row.Active === false) return null;

  return {
    code,
    label,
    parentCode: kind === 'settlement' ? str(row.CityMunicipalityHrID) || null : null,
    meta: kind === 'tt_category' ? TT_CATEGORY_AGE_RULES[code] ?? null : null,
  };
}
