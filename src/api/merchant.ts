import { request } from './client';

/** Shapes returned by /api/v1/merchant/* (read from the Razorpay test API by the backend). */
export interface PaymentItem {
  id: string; amount: number; amount_display: string; currency: string; status: string; method: string;
  created_at: string; contact_masked: string | null; email_masked: string | null; description: string | null;
  order_id: string | null; order_ref: string | null; fee?: number | null; tax?: number | null;
  refund_status?: string | null; amount_refunded?: number; error_description?: string | null;
  dispute: { id: string; status: string; reason_label: string } | null;
}
export interface SettlementItem { id: string; amount: number; amount_display: string; status: string; utr: string | null; created_at: string }
export interface Overview {
  collected_today: { amount: number; count: number; by_method: { method: string; amount: number }[] };
  week: { amount: number; count: number; days: { date: string; amount: number; count: number }[] };
  recent: PaymentItem[]; last_settlement: SettlementItem | null; balance?: number; disputes_open: number; unread_notifications: number;
}
export interface DisputeListItem {
  id: string; payment_id: string; status: string; amount: number; amount_display: string; reason_code: string;
  reason_label: string; respond_by_iso: string | null; deadline_passed: boolean; can_contest: boolean;
  bank_request: { field?: string; reason?: string } | null; evidence_files: number; created_at: string;
  proofs?: { label: string; verdict: 'strong' | 'relevant' | 'needs_attention' | 'not_useful' | null; field: string | null }[];
  response?: { summary: string | null; amount: number | null; submitted_at: number | null } | null;
}
export interface NotificationItem {
  id: number; dispute_id: string; kind: string; channel: 'in_app' | 'email' | 'whatsapp'; status: 'sent' | 'failed' | 'skipped';
  title: string; body: string; recipient: string | null; detail: string | null; read: boolean; created_at: string | null;
}
export interface Products {
  payment_links: { count: number; paid: number; recent: { id: string; amount_display: string; status: string; description: string | null; short_url: string | null }[] } | null;
  invoices: { count: number; paid: number } | null;
}
export interface Profile {
  name: string; merchant_id: string; mode: string; key_id_hint: string | null;
  channels: { in_app: boolean; push?: { on: boolean; configured: boolean; devices: number }; email: { on: boolean; to: string | null; configured: boolean }; whatsapp: { on: boolean; to: string | null; configured: boolean } };
}

export function createMerchantApi(token: string) {
  const get = <T,>(path: string, signal?: AbortSignal) => request<T>(`/merchant${path}`, { token, signal });
  return {
    profile: (s?: AbortSignal) => get<Profile>('/profile', s),
    overview: (s?: AbortSignal) => get<Overview>('/overview', s),
    payments: (days: number, q: string, s?: AbortSignal) => get<{ items: PaymentItem[] }>(`/payments?days=${days}&q=${encodeURIComponent(q)}`, s),
    payment: (id: string, s?: AbortSignal) => get<PaymentItem>(`/payments/${encodeURIComponent(id)}`, s),
    settlements: (days: number, s?: AbortSignal) => get<{ items: SettlementItem[] }>(`/settlements?days=${days}`, s),
    products: (s?: AbortSignal) => get<Products>('/products', s),
    disputes: (s?: AbortSignal) => get<{ items: DisputeListItem[] }>('/disputes', s),
    notifications: (s?: AbortSignal) => get<{ items: NotificationItem[]; unread: number }>('/notifications', s),
    markRead: () => request<void>('/merchant/notifications/read', { method: 'POST', token, body: {} }),
    pushKey: () => get<{ public_key: string | null }>('/push/key'),
    pushSubscribe: (sub: PushSubscriptionJSON) => request<{ subscribed: boolean }>('/merchant/push/subscribe', { method: 'POST', token, body: { endpoint: sub.endpoint, keys: sub.keys } }),
    pushUnsubscribe: (endpoint: string) => request<void>('/merchant/push/unsubscribe', { method: 'POST', token, body: { endpoint } }),
  };
}
export type MerchantApi = ReturnType<typeof createMerchantApi>;
