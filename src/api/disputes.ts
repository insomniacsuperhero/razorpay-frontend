import { ApiError, request } from './client';
import type { AcceptResponse, DisputeDetail } from './types';
const path = (id: string) => `/disputes/${encodeURIComponent(id)}`;
export async function getDispute(id: string, token: string, signal?: AbortSignal): Promise<DisputeDetail> {
  const data = await request<DisputeDetail>(path(id), { token, signal });
  if (!data?.dispute || data.dispute.id !== id || typeof data.dispute.amount_display !== 'string' || typeof data.dispute.status !== 'string' || typeof data.dispute.reason_label !== 'string' || !Array.isArray(data.requirements?.required) || !Array.isArray(data.requirements?.helpful) || !Array.isArray(data.evidence) || !data.run) {
    throw new ApiError('INVALID_RESPONSE', 'The service returned incomplete dispute details. Please try again.', 502);
  }
  return data;
}
export const acceptDispute = (id: string, token: string, key: string) => request<AcceptResponse>(`${path(id)}/accept`, { method: 'POST', token, body: {}, idempotencyKey: key });
