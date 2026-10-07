const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://proof-bridge-api.onrender.com/api/v1').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
  get isAuth() { return this.status === 401 || this.status === 403; }
}
export async function request<T>(path: string, options: { method?: string; token?: string; body?: unknown; signal?: AbortSignal; idempotencyKey?: string } = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 60000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method || 'GET', signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error?.code || 'REQUEST_FAILED', data?.error?.message || `The request failed (${response.status}). Please try again.`, response.status);
    if (data === null && response.status !== 204) throw new ApiError('INVALID_RESPONSE', 'The service returned an unexpected response. Please try again.', 502);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    throw new ApiError('NETWORK_ERROR', controller.signal.aborted ? 'The service took too long to respond. It may be waking up. Please try again.' : 'Unable to reach Proof Bridge. Check your connection and try again.', 0);
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}
