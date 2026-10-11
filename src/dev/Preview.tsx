import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppRoutes } from '../App';
import { AppContext } from '../features/app';
import type { Coverage, DisputeDetail, EvidenceCard, EvidencePatch } from '../api/types';
import type { DisputeApi } from '../api/workflow';
import type { DisputeListItem, MerchantApi, NotificationItem, PaymentItem } from '../api/merchant';

/** Development-only sample dispute. Mirrors the API's response shapes so every screen can be
 *  reviewed without a link token. Scenarios: /preview, /preview?s=bank, /preview?s=submitted, /preview?s=late. */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const STAGES = ['queued', 'extracting', 'analysing', 'validating', 'uploading', 'ready'] as const;

export function sampleDetail(scenario: string): DisputeDetail {
  const hours = scenario === 'late' ? 4 : 52;
  return {
    dispute: {
      id: 'disp_SampleTk9x2Q', status: scenario === 'submitted' ? 'under_review' : 'open', phase: 'chargeback', amount: 249900, amount_display: '₹2,499',
      reason_code: 'goods_not_received', reason_label: 'Customer says the order never arrived',
      respond_by_iso: new Date(Date.now() + hours * 3_600_000).toISOString(), seconds_left: hours * 3600, deadline_passed: false, can_contest: scenario !== 'submitted',
      bank_request: scenario === 'bank' ? { field: 'shipping_proof', reason: 'The delivery proof is unclear. Please upload a clearer courier screenshot.' } : null,
      evidence_on_record: scenario === 'submitted' ? { shipping_proof: ['doc_Sample1'], customer_communication: ['doc_Sample2'], summary: 'Order PB-1001 (₹2,499) was delivered on 7 Oct by Delhivery to the address given at checkout. The customer confirmed receipt on WhatsApp on 7 Oct.', amount: 249900, submitted_at: Math.floor(Date.now() / 1000) - 506 } : {},
    },
    payment: { id: 'pay_SampleTkYxHT', amount_display: '₹2,499', status: 'captured', method: 'upi', created_at: new Date(Date.now() - 6 * 86_400_000).toISOString(), contact_masked: '•••••4321', order_ref: 'PB-1001' },
    payment_verified: true,
    requirements: {
      required: [{ field: 'shipping_proof', label: 'Delivery confirmation' }],
      helpful: [{ field: 'customer_communication', label: 'Customer acknowledgement' }, { field: 'billing_proof', label: 'Purchase details' }],
      hint: "For 'not received', courier tracking or a delivery screenshot helps most.",
    },
    evidence: scenario === 'bank' ? [bankCard()] : scenario === 'submitted' ? sentCards() : [],
    run: { timer_started_at: scenario === 'submitted' ? new Date(Date.now() - 600_000).toISOString() : null, submitted_at: scenario === 'submitted' ? new Date(Date.now() - 600_000 + 94_000).toISOString() : null, draft_summary: null, contested_amount: null },
  };
}

/** Placeholder thumbnail for sample files (real disputes show the uploaded image). */
const sampleImg = (bg: string, line1: string, line2: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${bg}"/>` +
  `<rect x="24" y="40" width="192" height="160" rx="12" fill="#fff"/><text x="40" y="100" font-family="sans-serif" font-size="20" font-weight="700" fill="#1b2b44">${line1}</text>` +
  `<text x="40" y="136" font-family="sans-serif" font-size="16" fill="#5b6b85">${line2}</text></svg>`);

function sentCards(): EvidenceCard[] {
  const base = { status: 'ready' as const, stage_index: 5, detected_mime_type: 'image/jpeg', mismatches: [], facts: [] };
  return [
    { ...base, id: 'ev_s1', filename: 'delhivery.jpg', document_type: 'Courier tracking screenshot', field: 'shipping_proof', field_label: 'Delivery confirmation',
      verdict: 'strong', reason: 'Delivery status and tracking ID are readable, and the date matches the order.', razorpay_document_id: 'doc_Sample1', preview_url: sampleImg('#dbe9ff', 'Delhivery', 'Delivered · 7 Oct') },
    { ...base, id: 'ev_s2', filename: 'whatsapp-chat.png', document_type: 'WhatsApp chat with customer', field: 'customer_communication', field_label: 'Customer communication',
      verdict: 'relevant', reason: 'The customer says "received, thanks" on 7 Oct.', razorpay_document_id: 'doc_Sample2', preview_url: sampleImg('#dcf5e6', 'WhatsApp', 'Received, thanks') },
    { ...base, id: 'ev_s3', filename: 'product.jpg', document_type: 'Product photo', field: 'none', field_label: 'Not used',
      verdict: 'not_useful', reason: "This product photo doesn't confirm delivery.", razorpay_document_id: null, preview_url: sampleImg('#f3eadf', 'Product', 'Kurta, blue') },
  ];
}

function bankCard(): EvidenceCard {
  return {
    id: 'ev_bank', filename: 'courier.jpg', status: 'ready', stage_index: 5, document_type: 'Courier tracking screenshot', detected_mime_type: 'image/jpeg',
    field: 'shipping_proof', field_label: 'Delivery confirmation', verdict: 'needs_attention', verdict_label: 'Needs attention',
    reason: 'The bank asked for clearer proof: the delivery date is cut off.', bank_flag: 'The delivery proof is unclear. Please upload a clearer courier screenshot.',
    facts: [{ key: 'tracking_id', label: 'Tracking ID', value: '1490876543210', display: '1490876543210', source: 'courier.jpg', edited: false, matches_payment: false }],
    mismatches: [], razorpay_document_id: 'doc_Sample1',
  };
}

function read(name: string, paid: Date): Partial<EvidenceCard> {
  const n = name.toLowerCase();
  const day = (offset: number) => new Date(paid.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const fact = (key: string, label: string, value: string | number, display?: string, matches = false) => ({ key, label, value, display: display ?? String(value), source: name, edited: false, matches_payment: matches });
  if (/blur/.test(n)) return { document_type: 'Courier screenshot', field: 'shipping_proof', verdict: 'needs_attention', reason: "Delivery date isn't visible. Add a clearer screenshot.", facts: [fact('courier', 'Courier', 'Delhivery')] };
  if (/courier|deliver|track|awb/.test(n)) return { document_type: 'Delhivery tracking screenshot', field: 'shipping_proof', verdict: 'strong', reason: 'Delivery status and tracking ID are readable, and the date matches the order.', facts: [fact('tracking_id', 'Tracking ID', '1490876543210'), fact('courier', 'Courier', 'Delhivery'), fact('delivery_status', 'Delivery status', 'Delivered'), fact('delivery_date', 'Delivered on', day(2), new Date(day(2)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), true)] };
  if (/chat|whatsapp|message/.test(n)) return { document_type: 'WhatsApp chat with the customer', field: 'customer_communication', verdict: 'relevant', reason: 'We found the customer confirming receipt.', facts: [fact('customer_quote', 'Customer wrote', 'Received, thank you! Fits perfectly'), fact('contact_last4', 'Phone (last 4)', '4321', '4321', true)] };
  if (/invoice|bill|receipt/.test(n)) return { document_type: 'Invoice', field: 'billing_proof', verdict: 'relevant', reason: 'Invoice matches the disputed amount.', facts: [fact('invoice_number', 'Invoice', 'INV-2026-118'), fact('amount_paise', 'Amount', 249900, '₹2,499', true), fact('order_id', 'Order', 'PB-1001', 'PB-1001', true)] };
  return { document_type: 'Product photo', field: 'none', verdict: 'not_useful', reason: "This product photo doesn't confirm delivery.", facts: [] };
}

export function createFakeApi(detail: DisputeDetail): DisputeApi {
  const paid = new Date(String(detail.payment?.created_at));
  let summaryEdit: string | null = null;
  const docs = () => detail.evidence.filter(e => !e.removed && e.status === 'ready' && (e.verdict === 'strong' || e.verdict === 'relevant'));
  const generated = () => {
    const f = Object.fromEntries(docs().flatMap(c => c.facts || []).map(x => [x.key, x.display]));
    const parts = [`Payment pay_SampleTkYxHT of ₹2,499 for order PB-1001 was made on ${paid.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`];
    if (f.tracking_id) parts.push(`The order was delivered${f.delivery_date ? ` on ${f.delivery_date}` : ''} by ${f.courier || 'courier'}, tracking ID ${f.tracking_id}.`);
    if (f.customer_quote) parts.push(`The customer wrote: "${f.customer_quote}".`);
    if (f.invoice_number) parts.push(`Invoice ${f.invoice_number} for ${f.amount_paise || '₹2,499'} is attached.`);
    return parts.join(' ');
  };
  const coverage = (): Coverage => {
    const byField = (field: string) => docs().filter(c => c.field === field);
    const item = (r: { field: string; label: string }, role: string) => ({ ...r, role, state: byField(r.field).some(c => c.verdict === 'strong') ? 'strong' : byField(r.field).length ? 'present' : 'missing', evidence_ids: byField(r.field).map(c => c.id) });
    const required = detail.requirements.required.map(r => item(r, 'required'));
    const complete = required.every(r => r.state !== 'missing') && docs().length > 0;
    const fields: Record<string, string[]> = {};
    docs().forEach(c => { (fields[c.field!] ||= []).push(c.razorpay_document_id!); });
    return {
      required, helpful: detail.requirements.helpful.map(r => item(r, 'helpful')), complete,
      label: complete && required.every(r => r.state === 'strong') ? 'Good coverage' : complete ? 'Enough to submit' : 'Missing required proof',
      needs_attention: detail.evidence.filter(e => !e.removed && e.verdict === 'needs_attention').map(e => e.id), processing: [],
      fields_with_documents: fields, summary: { draft: summaryEdit ?? generated(), generated: generated(), edited: summaryEdit !== null, max_length: 1000 },
      contested_amount: 249900, disputed_amount: 249900,
    };
  };
  const advance = async (card: EvidenceCard) => {
    for (const s of STAGES.slice(1)) { await sleep(s === 'analysing' ? 1600 : 700); card.status = s; card.stage_index = STAGES.indexOf(s); }
    Object.assign(card, read(card.filename, paid));
    card.field_label = { shipping_proof: 'Delivery confirmation', customer_communication: 'Customer acknowledgement', billing_proof: 'Purchase details' }[card.field || ''] || 'Not used';
    if (card.verdict === 'strong' || card.verdict === 'relevant') card.razorpay_document_id = `doc_Sample${Math.random().toString(36).slice(2, 8)}`;
  };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  const find = (id: string) => detail.evidence.find(e => e.id === id)!;
  let n = 0;
  return {
    detail: async () => { await sleep(150); return clone(detail); },
    accept: async () => { await sleep(500); detail.dispute.status = 'lost'; return { dispute: clone(detail.dispute) }; },
    startTimer: async () => { detail.run.timer_started_at ||= new Date().toISOString(); return { timer_started_at: detail.run.timer_started_at }; },
    createUpload: async (file: File) => { await sleep(200); return { upload_id: `up_${++n}:${file.name}`, put_url: 'https://example.invalid/upload', method: 'PUT' as const, headers: {}, expires_in: 900 }; },
    putFile: async (_slot, _file, onProgress) => { for (let p = 0; p <= 100; p += 25) { onProgress(p); await sleep(120); } },
    completeUpload: async (uploadId: string) => {
      const card: EvidenceCard = { id: `ev_${uploadId}`, filename: uploadId.split(':').slice(1).join(':'), status: 'queued', stage_index: 0, facts: [], mismatches: [] };
      detail.evidence.push(card); void advance(card);
      return { evidence_id: card.id, status: 'queued' };
    },
    evidence: async (id: string) => clone(find(id)),
    patchEvidence: async (id: string, body: EvidencePatch) => {
      const c = find(id); await sleep(300);
      if (body.fact_key) { const f = c.facts?.find(x => x.key === body.fact_key); if (f) { f.value = body.value ?? ''; f.display = String(body.value ?? ''); f.edited = true; } }
      if (body.clear_bank_flag) { c.bank_flag = null; }
      if (body.confirm) { c.merchant_confirmed = true; c.verdict = 'relevant'; c.mismatches = []; }
      return clone(c);
    },
    retryEvidence: async (id: string) => { const c = find(id); c.status = 'queued'; void advance(c); return { evidence_id: id, status: 'queued' }; },
    removeEvidence: async (id: string) => { find(id).removed = true; },
    coverage: async () => { await sleep(200); return coverage(); },
    saveDraft: async body => { summaryEdit = body.summary; return coverage(); },
    contest: async (_key: string, action = 'submit') => {
      await sleep(700);
      if (action === 'submit') { detail.dispute.status = 'under_review'; detail.run.submitted_at = new Date().toISOString(); { const cov = coverage(); detail.dispute.evidence_on_record = { ...cov.fields_with_documents, summary: cov.summary.draft, amount: cov.contested_amount, submitted_at: Math.floor(Date.now() / 1000) }; } detail.dispute.bank_request = null; }
      const secs = detail.run.timer_started_at ? Math.round((Date.now() - Date.parse(detail.run.timer_started_at)) / 1000) : null;
      return { dispute: clone(detail.dispute), documents: docs().length, seconds_to_submit: action === 'submit' ? secs : null };
    },
  } as DisputeApi;
}

/** Sample merchant data in the same shapes as /api/v1/merchant/* (which reads the Razorpay test API). */
export function createFakeMerchant(detail: DisputeDetail): MerchantApi {
  const day = 86_400_000, now = Date.now();
  const mk = (i: number, amount: number, method: string, ago: number, status = 'captured', extra: Partial<PaymentItem> = {}): PaymentItem => ({
    id: `pay_Sample${String(i).padStart(4, '0')}`, amount, amount_display: `₹${(amount / 100).toLocaleString('en-IN')}`, currency: 'INR', status, method,
    created_at: new Date(now - ago).toISOString(), contact_masked: `•••••${4300 + i}`, email_masked: null, description: null,
    order_id: null, order_ref: null, fee: Math.round(amount * 0.02), dispute: null, ...extra,
  });
  const disputed = (): PaymentItem => mk(0, detail.dispute.amount, 'upi', 6 * day, 'captured', {
    id: detail.payment!.id, contact_masked: detail.payment!.contact_masked || null, order_ref: 'PB-1001',
    dispute: { id: detail.dispute.id, status: detail.dispute.status, reason_label: detail.dispute.reason_label } });
  const payments = (): PaymentItem[] => [
    mk(1, 129900, 'upi', 20 * 60_000), mk(2, 59900, 'card', 55 * 60_000), mk(3, 89900, 'upi', 1 * day + 3_600_000),
    mk(4, 34900, 'netbanking', 2 * day), mk(5, 199900, 'upi', 3 * day), mk(6, 49900, 'card', 4 * day, 'failed', { error_description: 'Payment was cancelled by the customer.' }),
    mk(7, 74900, 'wallet', 5 * day), disputed(),
  ];
  const disputeItem = (): DisputeListItem => ({ ...detail.dispute, payment_id: detail.payment!.id, evidence_files: detail.evidence.filter(e => !e.removed).length,
    proofs: detail.evidence.filter(e => !e.removed && e.status === 'ready').map(e => ({ label: e.document_type || e.filename, verdict: e.verdict ?? null, field: e.field ?? null })),
    response: detail.dispute.evidence_on_record.submitted_at ? { summary: (detail.dispute.evidence_on_record.summary as string) ?? null, amount: (detail.dispute.evidence_on_record.amount as number) ?? null, submitted_at: detail.dispute.evidence_on_record.submitted_at as number } : null,
    created_at: new Date(now - 2 * 3_600_000).toISOString() } as DisputeListItem);
  let read = false;
  const notes = (): NotificationItem[] => (['in_app', 'whatsapp', 'email'] as const).map((channel, i) => ({
    id: 100 + i, dispute_id: detail.dispute.id, kind: detail.dispute.bank_request ? 'action_required' : 'dispute_created', channel, status: 'sent',
    title: detail.dispute.bank_request ? 'The bank needs more proof for the ₹2,499 dispute' : 'Dispute on ₹2,499',
    body: `${detail.dispute.reason_label}. Add proof from your phone; it takes about 2 minutes.`,
    recipient: channel === 'email' ? 'h•••@example.com' : channel === 'whatsapp' ? '•••••5678' : 'Razorpay app', detail: null,
    read: channel !== 'in_app' || read, created_at: new Date(now - 2 * 3_600_000).toISOString() }));
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  return {
    profile: async () => ({ name: 'Your business', merchant_id: 'merchant_demo', mode: 'test', key_id_hint: 'rzp_test_•••Ab12',
      channels: { in_app: true, email: { on: true, to: 'h•••@example.com', configured: true }, whatsapp: { on: true, to: '•••••5678', configured: true } } }),
    overview: async () => {
      const ps = payments().filter(p => p.status === 'captured');
      const days = Array.from({ length: 7 }, (_, k) => { const start = today0.getTime() - (6 - k) * day; const inDay = ps.filter(p => { const t = Date.parse(p.created_at); return t >= start && t < start + day; });
        return { date: new Date(start).toISOString().slice(0, 10), amount: inDay.reduce((a, p) => a + p.amount, 0), count: inDay.length }; });
      const today = ps.filter(p => Date.parse(p.created_at) >= today0.getTime());
      return { collected_today: { amount: today.reduce((a, p) => a + p.amount, 0), count: today.length, by_method: [{ method: 'upi', amount: 129900 }, { method: 'card', amount: 59900 }].filter(m => today.some(p => p.method === m.method)) },
        week: { amount: days.reduce((a, d) => a + d.amount, 0), count: days.reduce((a, d) => a + d.count, 0), days },
        recent: payments().slice(0, 5), last_settlement: null, balance: ps.reduce((a, p) => a + p.amount - (p.fee || 0), 0), disputes_open: detail.dispute.status === 'open' ? 1 : 0, unread_notifications: read ? 0 : 1 };
    },
    payments: async (days: number, q: string) => ({ items: payments().filter(p => Date.parse(p.created_at) >= today0.getTime() - (days - 1) * day && (!q || p.id.includes(q) || (p.contact_masked || '').includes(q))) }),
    payment: async (id: string) => { const p = payments().find(x => x.id === id); if (!p) throw new Error('Payment not found'); return p; },
    settlements: async () => ({ items: [] }),
    products: async () => ({ payment_links: { count: 4, paid: 3, recent: [{ id: 'plink_S1', amount_display: '₹2,499', status: 'paid', description: 'Handloom kurta', short_url: null }, { id: 'plink_S2', amount_display: '₹899', status: 'created', description: 'Cotton dupatta', short_url: null }] }, invoices: { count: 1, paid: 1 } }),
    disputes: async () => ({ items: [disputeItem()] }),
    notifications: async () => ({ items: notes(), unread: read ? 0 : 1 }),
    markRead: async (_disputeId?: string) => { read = true; },
    pushKey: async () => ({ public_key: null }),
    pushSubscribe: async () => ({ subscribed: true }),
    pushUnsubscribe: async () => undefined,
  };
}

export default function Preview() {
  const [params] = useSearchParams();
  const [scenario] = useState(() => params.get('s') || 'new');   // keep the scenario while navigating between screens
  const { api, merchant } = useMemo(() => { const d = sampleDetail(scenario); return { api: createFakeApi(d), merchant: createFakeMerchant(d) }; }, [scenario]);
  const makeApi = useCallback(() => api, [api]);   // the sample app has one dispute
  return <AppContext.Provider value={{ merchant, base: '/preview', preview: true, onAuthError: () => undefined }}>
    <AppRoutes expire={() => undefined} makeApi={makeApi} preview />
  </AppContext.Provider>;
}
