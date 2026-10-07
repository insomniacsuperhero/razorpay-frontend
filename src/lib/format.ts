import { useEffect, useState } from 'react';
import type { DisputeDetail, EvidenceCard } from '../api/types';

/** Re-renders every `ms` so countdowns and the response timer stay live. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function deadlineParts(iso: string | null, now: number) {
  if (!iso) return null;
  const end = Date.parse(iso);
  const left = Math.max(0, end - now);
  const h = Math.floor(left / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000);
  const when = new Date(end).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const countdown = left === 0 ? 'Deadline passed' : h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h}h ${m}m left` : `${m}m left`;
  return { when, countdown, passed: left === 0, urgent: left > 0 && left < 6 * 3_600_000 };
}

export function elapsed(fromIso: string | null | undefined, to: number | string | null | undefined) {
  if (!fromIso) return null;
  const end = typeof to === 'string' ? Date.parse(to) : to ?? Date.now();
  const s = Math.max(0, Math.round((end - Date.parse(fromIso)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function secondsText(s: number | null | undefined) {
  if (s == null) return null;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m} min ${r} s` : `${r} s`;
}

export function paymentDate(v: string | number | undefined) {
  if (v === undefined) return '';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const METHOD: Record<string, string> = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay later' };

export type Verdict = NonNullable<EvidenceCard['verdict']>;
export const VERDICT_COLOR: Record<Verdict, 'positive' | 'information' | 'notice' | 'neutral'> = {
  strong: 'positive', relevant: 'information', needs_attention: 'notice', not_useful: 'neutral',
};
export const VERDICT_LABEL: Record<Verdict, string> = {
  strong: 'Strong', relevant: 'Relevant', needs_attention: 'Needs attention', not_useful: 'Not useful for this dispute',
};
const RANK: Record<Verdict, number> = { strong: 0, relevant: 1, needs_attention: 2, not_useful: 3 };
export const bestVerdict = (cards: EvidenceCard[]) =>
  cards.map(c => c.verdict).filter((v): v is Verdict => !!v).sort((a, b) => RANK[a] - RANK[b])[0];

export const PROCESSING = new Set(['queued', 'extracting', 'analysing', 'validating', 'uploading']);
export const isUseful = (c: EvidenceCard) => c.status === 'ready' && (c.verdict === 'strong' || c.verdict === 'relevant');

export function activeEvidence(d: DisputeDetail) { return d.evidence.filter(e => !e.removed); }

/** Short "what we found" line for a finished file, e.g. "Tracking ID found · Delivered 2 Oct 2026". */
export function findingLine(c: EvidenceCard) {
  const f = Object.fromEntries((c.facts || []).map(x => [x.key, x]));
  const bits: string[] = [];
  if (f.tracking_id) bits.push('Tracking ID found');
  if (f.delivery_status) bits.push(String(f.delivery_status.display) + (f.delivery_date ? ` ${shortDate(f.delivery_date.value)}` : ''));
  if (f.customer_quote) bits.push('Customer message found');
  if (f.invoice_number) bits.push(`Invoice ${f.invoice_number.display}`);
  if (f.amount_paise && !f.invoice_number) bits.push(`${f.amount_paise.display}`);
  if (f.refund_reference) bits.push('Refund reference found');
  if (!bits.length && f.order_id) bits.push(`Order ${f.order_id.display}`);
  return bits.slice(0, 2).join(' · ');
}

export function shortDate(v: unknown) {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Plain-language status for screen 3 while a file is being read. */
export const STAGE_TEXT: Record<string, string> = {
  queued: 'Waiting to be read',
  extracting: 'Opening the file',
  analysing: 'Reading what the file shows',
  validating: 'Checking it against the payment',
  uploading: 'Saving it to Razorpay',
};

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
