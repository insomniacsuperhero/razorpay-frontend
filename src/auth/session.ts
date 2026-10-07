import { ApiError, request } from '../api/client';
import type { Session } from '../api/types';
// localStorage so the installed app stays signed in between launches (tokens still expire after 2 h)
const PREFIX = 'proof-bridge:session:';
const memory = new Map<string, Session>();
const MERCHANT = 'merchant';
/** A session is the merchant's app session: the one for the dispute in the link also opens the app's other tabs
 *  and other disputes, so it is kept under the dispute id and under a merchant-wide key. */
export function validSession(value: unknown, id: string): value is Session {
  if (!value || typeof value !== 'object') return false;
  const session = value as Session;
  return (id === MERCHANT || session.dispute_id === id) && typeof session.access_token === 'string' && !!session.access_token && session.token_type === 'bearer' && Number.isFinite(Date.parse(session.expires_at)) && Date.parse(session.expires_at) > Date.now();
}
export function clearSession(id: string) { memory.delete(id); try { localStorage.removeItem(PREFIX + id); } catch { /* Memory still cleared when storage is blocked. */ } }
function readKey(id: string): Session | null {
  let value: unknown = memory.get(id);
  try { value = JSON.parse(localStorage.getItem(PREFIX + id) || 'null') || value; } catch { /* Private browser may disable storage. */ }
  if (validSession(value, id)) return value;
  clearSession(id); return null;
}
export function readSession(id: string): Session | null {
  return readKey(id) || readKey(MERCHANT);
}
function saveSession(session: Session) {
  for (const key of session.dispute_id ? [session.dispute_id, MERCHANT] : [MERCHANT]) {
    memory.set(key, session);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(session)); } catch { /* Fall back to tab memory. */ }
  }
}
// Capture once before rendering. Never leave the bearer link in the address bar or history.
export function consumeLinkToken(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('t');
  if (url.searchParams.has('t')) { url.searchParams.delete('t'); window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash); }
  return token;
}
const exchanges = new Map<string, Promise<Session>>();
export function exchangeLink(id: string, linkToken: string): Promise<Session> {
  const key = id + ':' + linkToken;
  const existing = exchanges.get(key);
  if (existing) return existing;
  clearSession(id);
  const promise = request<Session>('/sessions/exchange', { method: 'POST', body: { token: linkToken } }).then(session => {
    if (!validSession(session, id)) throw new ApiError('AUTH_INVALID', 'This alert does not grant access to this dispute. Open the latest alert for this dispute.', 403);
    saveSession(session); return session;
  }).finally(() => exchanges.delete(key));
  exchanges.set(key, promise); return promise;
}

/** Prototype open access: sign in as the demo merchant without an alert link (404/403 when the server disallows it). */
let opening: Promise<Session> | null = null;
export function openSession(): Promise<Session> {
  opening ||= request<Session>('/sessions/open', { method: 'POST', body: {} }).then(session => {
    if (!validSession(session, MERCHANT)) throw new ApiError('AUTH_INVALID', 'Could not open the app.', 403);
    saveSession(session); return session;
  }).finally(() => { opening = null; });
  return opening;
}
