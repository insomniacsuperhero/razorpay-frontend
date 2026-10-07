import { useEffect, useState, type ComponentType, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import {
  AlertTriangleIcon, ArrowLeftIcon, BankIcon, Badge, BellIcon, Button, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon,
  ChevronUpIcon, CreditCardIcon, FileIcon, GlobeIcon, GridIcon, HelpCircleIcon, IconButton, InvoicesIcon, LinkIcon,
  MailIcon, MessageCircleIcon, PaymentLinksIcon, PaymentPagesIcon, QRCodeIcon, RayIcon, SearchIcon, ShareIcon, Spinner, Text,
} from '@razorpay/blade/components';
import { ApiError } from '../api/client';
import type { DisputeListItem, NotificationItem, PaymentItem } from '../api/merchant';
import { initials, MERCHANT_NAME, TabPage } from '../components/AppShell';
import { deadlineParts, METHOD, paymentDate, useNow } from '../lib/format';
import { disputeHref, useApp } from './app';
import { PhoneNotificationsRow, PushPrompt } from './PhoneNotifications';

/* ---------------- data ---------------- */

/** Query helper for the tabs: shares the workspace's auth handling and refreshes in the background. */
export function useMerchant<T>(key: QueryKey, fn: (signal: AbortSignal) => Promise<T>, refetchMs = 30_000) {
  const { onAuthError } = useApp();
  const q = useQuery({ queryKey: ['merchant', ...key], queryFn: ({ signal }) => fn(signal), refetchInterval: refetchMs, staleTime: 10_000 });
  useEffect(() => { if (q.error instanceof ApiError && q.error.isAuth) onAuthError(); }, [q.error, onAuthError]);
  return q;
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortInr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function Loading() { return <div className="card center empty-card"><Spinner accessibilityLabel="Loading" size="large" /></div>; }
function Failed({ error, retry }: { error: Error; retry: () => void }) {
  return <div className="card center empty-card"><Text weight="semibold">Couldn't load this</Text><Text size="small" color="surface.text.gray.muted">{error.message}</Text><Button size="small" variant="secondary" onClick={retry}>Try again</Button></div>;
}
function Empty({ icon: Icon, title, sub }: { icon: ComponentType<{ size?: 'xlarge'; color?: 'surface.icon.gray.muted' }>; title: string; sub: string }) {
  return <div className="card center empty-card"><Icon size="xlarge" color="surface.icon.gray.muted" /><Text weight="semibold">{title}</Text><Text size="small" color="surface.text.gray.muted">{sub}</Text></div>;
}

/* ---------------- shared pieces ---------------- */

function DisputeAlert({ d }: { d: DisputeListItem }) {
  const ws = useApp();
  const now = useNow(60_000);
  const dl = deadlineParts(d.respond_by_iso, now);
  return (
    <Link to={disputeHref(ws.base, d.id)} className={`dispute-alert ${dl?.urgent ? 'urgent' : ''}`}>
      <AlertTriangleIcon size="large" color="feedback.icon.notice.intense" />
      <div>
        <Text weight="semibold">{d.bank_request ? `The bank needs more proof · ${d.amount_display}` : `Dispute on ${d.amount_display}`}</Text>
        <Text size="small" color="surface.text.gray.subtle">{d.reason_label}</Text>
        {dl && <Text size="small" weight="semibold" color="feedback.text.notice.intense">Respond by {dl.when} · {dl.countdown}</Text>}
      </div>
      <span className="alert-cta"><Text size="small" weight="semibold" color="surface.text.primary.normal">{d.evidence_files ? 'Continue' : 'Respond'}</Text></span>
    </Link>
  );
}

const DISPUTE_BADGE: Record<string, { t: string; c: 'notice' | 'information' | 'positive' | 'negative' | 'neutral' }> = {
  open: { t: 'Disputed', c: 'notice' }, under_review: { t: 'Dispute in review', c: 'information' },
  won: { t: 'Dispute won', c: 'positive' }, lost: { t: 'Dispute lost', c: 'negative' }, closed: { t: 'Dispute closed', c: 'neutral' },
};
const STATUS_BADGE: Record<string, { t: string; c: 'positive' | 'negative' | 'neutral' | 'information' | 'notice' }> = {
  captured: { t: 'Captured', c: 'positive' }, authorized: { t: 'Authorized', c: 'information' }, failed: { t: 'Failed', c: 'negative' },
  refunded: { t: 'Refunded', c: 'neutral' }, created: { t: 'Created', c: 'neutral' },
};

function PaymentRow({ p }: { p: PaymentItem }) {
  const { base: root } = useApp();
  const b = p.dispute ? DISPUTE_BADGE[p.dispute.status] || DISPUTE_BADGE.open : STATUS_BADGE[p.status] || { t: p.status, c: 'neutral' as const };
  return (
    <Link to={`${root}/payments/${p.id}`} className="pay-row">
      <div className="pay-main">
        <Text weight="semibold">{p.amount_display}</Text>
        <Text size="small" color="surface.text.gray.muted">{METHOD[p.method] || p.method} · {p.contact_masked || p.email_masked || p.id} · {time(p.created_at)}</Text>
      </div>
      <Badge color={b.c} emphasis="subtle" size="small">{b.t}</Badge>
    </Link>
  );
}

/* ---------------- Home ---------------- */

export function HomeTab() {
  const ws = useApp();
  const { merchant, base: root } = ws;
  const navigate = useNavigate();
  const ov = useMerchant(['overview'], s => merchant.overview(s));
  const disputes = useMerchant(['disputes'], s => merchant.disputes(s));
  const [breakdown, setBreakdown] = useState(false);
  const prof = useMerchant(['profile'], s => merchant.profile(s), 300_000);
  const name = prof.data?.name && prof.data.name !== 'Your business' ? prof.data.name : MERCHANT_NAME;
  const open = (disputes.data?.items || []).filter(d => d.status === 'open');
  const o = ov.data;
  const max = Math.max(1, ...(o?.week.days.map(d => d.amount) || [0]));
  return (
    <TabPage root={root} header={
      <header className="home-header">
        <span className="avatar small">{initials(name)}</span>
        <div><Text size="small" color="surface.text.gray.muted">{greeting()}</Text><Text size="large" weight="semibold">{name.toUpperCase()}</Text></div>
      </header>}>
      {open.slice(0, 2).map(d => <DisputeAlert key={d.id} d={d} />)}
      <PushPrompt />
      {ov.isPending ? <Loading /> : ov.isError ? <Failed error={ov.error} retry={() => void ov.refetch()} /> : o && <>
        <div className="card center">
          <Text color="surface.text.gray.muted">Collected today</Text>
          <span className="big-amount">{inr(o.collected_today.amount)}</span>
          <button className="pill" onClick={() => setBreakdown(x => !x)}>View breakdown ({o.collected_today.count} payment{o.collected_today.count === 1 ? '' : 's'}) {breakdown ? <ChevronUpIcon size="small" color="surface.icon.gray.normal" /> : <ChevronDownIcon size="small" color="surface.icon.gray.normal" />}</button>
          {breakdown && <div className="breakdown">{o.collected_today.by_method.length ? o.collected_today.by_method.map(m => (
            <div key={m.method} className="kv"><Text size="small" color="surface.text.gray.muted">{METHOD[m.method] || m.method}</Text><Text size="small" weight="semibold">{inr(m.amount)}</Text></div>
          )) : <Text size="small" color="surface.text.gray.muted">No payments today</Text>}</div>}
          <div className="split">
            <div><Text size="small" color="surface.text.gray.muted">Last settlement</Text>
              <Text weight="semibold">{o.last_settlement ? `${o.last_settlement.amount_display} · ${paymentDate(o.last_settlement.created_at)}` : 'No settlements yet'}</Text></div>
            <div><Text size="small" color="surface.text.gray.muted">Open disputes</Text><Text size="large" weight="semibold">{String(o.disputes_open)}</Text>
              <Text size="xsmall" color="surface.text.gray.muted">{o.disputes_open ? 'Need a response' : 'All clear'}</Text></div>
          </div>
        </div>
        <div className="collect">
          <Text size="large" weight="semibold">Collect payments</Text>
          <div className="mylink">
            <LinkIcon size="medium" color="surface.icon.staticWhite.normal" />
            <div><span className="mylink-sub">Get paid on your branded Razorpay link</span><span className="mylink-url">razorpay.me/@{name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'yourbusiness'}</span></div>
            <span className="share"><ShareIcon size="small" color="surface.icon.gray.normal" /> Share</span>
          </div>
          <div className="quick">
            {[{ i: PaymentLinksIcon, t: 'Payment links' }, { i: PaymentPagesIcon, t: 'Payment pages' }, { i: GridIcon, t: 'All products' }].map(q => (
              <button key={q.t} className="quick-item" onClick={() => navigate(`${root}/products`)}>
                <span className="quick-icon"><q.i size="xlarge" color="surface.icon.primary.normal" /></span><Text size="small" weight="semibold">{q.t}</Text>
              </button>
            ))}
          </div>
        </div>
        <Text size="large" weight="semibold">Payments</Text>
        <div className="card">
          <div className="row-head"><div><span className="mid-amount">{inr(o.week.amount)}</span><Text color="surface.text.gray.muted">{o.week.count} payment{o.week.count === 1 ? '' : 's'}</Text></div><span className="chip">Past 7 days</span></div>
          <div className="bars" role="img" aria-label="Captured amount per day, past 7 days">
            {o.week.days.map(d => (
              <div key={d.date} className="bar-col" title={`${shortInr(d.amount)} · ${d.count}`}>
                <span className="bar" style={{ height: `${Math.max(3, (d.amount / max) * 100)}%`, opacity: d.amount ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="bar-axis">{[0, 3, 6].map(i => <Text key={i} size="small" color="surface.text.gray.muted">{new Date(o.week.days[i]!.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>)}</div>
        </div>
        <div className="row-head"><Text size="large" weight="semibold">Recent payments</Text><Link to={`${root}/payments`} className="see-all">See all</Link></div>
        <div className="card list">{o.recent.length ? o.recent.map(p => <PaymentRow key={p.id} p={p} />) : <div className="pay-row"><Text color="surface.text.gray.muted">No payments yet</Text></div>}</div>
      </>}
    </TabPage>
  );
}

/* ---------------- Payments ---------------- */

export function PaymentsTab() {
  const { merchant, base: root } = useApp();
  const [tab, setTab] = useState<'tx' | 'st'>('tx');
  const [days, setDays] = useState(7);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const pays = useMerchant(['payments', days, q], s => merchant.payments(days, q, s));
  const stl = useMerchant(['settlements', days], s => merchant.settlements(days, s), 60_000);
  const submit = (e: FormEvent) => { e.preventDefault(); setQ(draft.trim()); };
  return (
    <TabPage root={root} header={
      <div className="seg">
        <button className={tab === 'tx' ? 'on' : ''} onClick={() => setTab('tx')}>Transactions</button>
        <button className={tab === 'st' ? 'on' : ''} onClick={() => setTab('st')}>Settlements</button>
      </div>}>
      <div className="chips">
        {[1, 7, 30].map(n => <button key={n} className={`chip filter ${days === n ? 'on' : ''}`} onClick={() => setDays(n)}>{n === 1 ? 'Today' : `Past ${n} days`}</button>)}
      </div>
      {tab === 'tx' ? <>
        <form className="search" onSubmit={submit}>
          <SearchIcon size="medium" color="surface.icon.gray.muted" />
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Search by payment ID, phone, email or note" aria-label="Search payments" />
        </form>
        {pays.isPending ? <Loading /> : pays.isError ? <Failed error={pays.error} retry={() => void pays.refetch()} />
          : pays.data.items.length ? <div className="card list">{pays.data.items.map(p => <PaymentRow key={p.id} p={p} />)}</div>
          : <Empty icon={CreditCardIcon} title="No payments" sub="Try a wider date range or clear the search." />}
      </> : stl.isPending ? <Loading /> : stl.isError ? <Failed error={stl.error} retry={() => void stl.refetch()} />
        : stl.data.items.length ? <div className="card list">{stl.data.items.map(s => (
          <div key={s.id} className="pay-row"><div className="pay-main"><Text weight="semibold">{s.amount_display}</Text><Text size="small" color="surface.text.gray.muted">{s.utr || s.id} · {time(s.created_at)}</Text></div>
            <Badge color={s.status === 'processed' ? 'positive' : s.status === 'failed' ? 'negative' : 'neutral'} emphasis="subtle" size="small">{s.status}</Badge></div>
        ))}</div> : <Empty icon={BankIcon} title="No settlements in this range" sub="Test-mode payments don't settle to a bank account." />}
    </TabPage>
  );
}

/** Payment detail (existing app screen) with a Dispute section: the in-app way into the flow. */
export function PaymentDetail() {
  const ws = useApp();
  const { merchant, base: root } = ws;
  const { paymentId = '' } = useParams();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const q = useMerchant(['payment', paymentId], s => merchant.payment(paymentId, s));
  const disputes = useMerchant(['disputes'], s => merchant.disputes(s));
  const p = q.data;
  const d = disputes.data?.items.find(x => x.payment_id === paymentId);
  const dl = d ? deadlineParts(d.respond_by_iso, now) : null;
  const st = p ? STATUS_BADGE[p.status] || { t: p.status, c: 'neutral' as const } : null;
  return (
    <div className="tab-page">
      <header className="page-header with-back">
        <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={() => navigate(-1)} />
        <Text size="large" weight="semibold">Payment details</Text>
      </header>
      <main className="tab-content">
        {q.isPending ? <Loading /> : q.isError ? <Failed error={q.error} retry={() => void q.refetch()} /> : p && <>
          <div className="card">
            <span className="big-amount left">{p.amount_display}</span>
            {st && <Badge color={st.c} emphasis="subtle" size="small">{st.t}</Badge>}
            <div className="rows">
              <KV k="Payment ID" v={p.id} />
              <KV k="Method" v={METHOD[p.method] || p.method} />
              <KV k="Created" v={time(p.created_at)} />
              {p.contact_masked && <KV k="Phone" v={p.contact_masked} />}
              {p.email_masked && <KV k="Email" v={p.email_masked} />}
              {(p.order_ref || p.order_id) && <KV k="Order" v={p.order_ref || p.order_id || ''} />}
              {p.description && <KV k="Description" v={p.description} />}
              {p.fee != null && <KV k="Fee (incl. tax)" v={inr(p.fee)} />}
              {!!p.amount_refunded && <KV k="Refunded" v={inr(p.amount_refunded)} />}
              {p.error_description && <KV k="Failure reason" v={p.error_description} />}
            </div>
          </div>
          {d && (
            <div className="card dispute-section">
              <div className="row-head"><Text weight="semibold">Dispute</Text><Badge color={(DISPUTE_BADGE[d.status] || DISPUTE_BADGE.open).c} emphasis="subtle" size="small">{d.status === 'open' ? 'Action required' : (DISPUTE_BADGE[d.status] || DISPUTE_BADGE.open).t}</Badge></div>
              <Text>{d.reason_label}</Text>
              {d.status === 'open' && dl && <Text size="small" color="feedback.text.notice.intense">Respond by {dl.when} · {dl.countdown}</Text>}
              <Button isFullWidth variant={d.status === 'open' ? 'primary' : 'secondary'} onClick={() => navigate(disputeHref(ws.base, d.id))}>{d.status === 'open' ? 'Respond to dispute' : 'View dispute'}</Button>
            </div>
          )}
        </>}
      </main>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return <div className="kv"><Text size="small" color="surface.text.gray.muted">{k}</Text><Text size="small" weight="medium">{v}</Text></div>;
}

/* ---------------- Disputes ---------------- */

type Bucket = 'action' | 'review' | 'closed';
const bucketOf = (d: DisputeListItem): Bucket => d.status === 'open' ? 'action' : d.status === 'under_review' ? 'review' : 'closed';

export function DisputesTab() {
  const ws = useApp();
  const now = useNow(60_000);
  const q = useMerchant(['disputes'], s => ws.merchant.disputes(s), 20_000);
  const [tab, setTab] = useState<Bucket>('action');
  const items = q.data?.items || [];
  const label: Record<Bucket, string> = { action: 'Needs response', review: 'In review', closed: 'Closed' };
  const shown = items.filter(d => bucketOf(d) === tab);
  return (
    <TabPage root={ws.base} title="Disputes">
      <div className="chips">
        {(['action', 'review', 'closed'] as Bucket[]).map(b => (
          <button key={b} className={`chip filter ${tab === b ? 'on' : ''}`} onClick={() => setTab(b)}>{label[b]} {items.filter(d => bucketOf(d) === b).length}</button>
        ))}
      </div>
      {q.isPending ? <Loading /> : q.isError ? <Failed error={q.error} retry={() => void q.refetch()} /> : shown.length ? shown.map(d => {
        const dl = deadlineParts(d.respond_by_iso, now);
        const b = d.status === 'open' ? (d.bank_request ? { t: 'More proof needed', c: 'notice' as const } : { t: 'Action required', c: 'notice' as const })
          : d.status === 'under_review' ? { t: 'Under review', c: 'information' as const } : d.status === 'won' ? { t: 'Won', c: 'positive' as const }
          : d.status === 'lost' ? { t: 'Lost', c: 'negative' as const } : { t: 'Closed', c: 'neutral' as const };
        return (
          <Link key={d.id} to={disputeHref(ws.base, d.id)} className={`card dispute-row ${d.status === 'open' ? '' : 'calm'}`}>
            <div className="row-head"><Text size="large" weight="semibold">{d.amount_display}</Text><Badge color={b.c} emphasis="subtle" size="small">{b.t}</Badge></div>
            <Text>{d.reason_label}</Text>
            <Text size="small" color="surface.text.gray.muted">{d.payment_id} · raised {time(d.created_at)}</Text>
            {d.status === 'open' && dl && <Text size="small" weight="semibold" color={dl.urgent ? 'feedback.text.notice.intense' : 'surface.text.gray.subtle'}>Respond by {dl.when} · {dl.countdown}</Text>}
            {d.status === 'open' && <span className="row-cta"><Text size="small" weight="semibold" color="surface.text.primary.normal">{d.bank_request ? 'Add clearer proof' : d.evidence_files ? `Continue · ${d.evidence_files} file${d.evidence_files === 1 ? '' : 's'} added` : 'Add proof from phone'} →</Text></span>}
          </Link>
        );
      }) : <Empty icon={AlertTriangleIcon} title={tab === 'action' ? 'Nothing needs a response' : tab === 'review' ? 'No disputes in review' : 'No closed disputes'}
        sub={tab === 'action' ? "We'll alert you here, on WhatsApp and by email when a customer raises one." : 'Disputes move here after you respond.'} />}
    </TabPage>
  );
}

/* ---------------- Products ---------------- */

export function ProductsTab() {
  const { merchant, base: root } = useApp();
  const q = useMerchant(['products'], s => merchant.products(s), 60_000);
  const tile = (Icon: ComponentType<{ size?: 'large'; color?: 'surface.icon.gray.normal' }>, t: string, s: string, stat?: string | null) => (
    <div className="tile"><span className="tile-icon"><Icon size="large" color="surface.icon.gray.normal" /></span><Text size="large" weight="semibold">{t}</Text><Text size="small" color="surface.text.gray.muted">{s}</Text>
      {stat && <span className="tile-stat"><Text size="small" weight="semibold" color="surface.text.primary.normal">{stat}</Text></span>}</div>
  );
  const pl = q.data?.payment_links, inv = q.data?.invoices;
  return (
    <TabPage root={root} title="Products">
      <Text size="small" weight="semibold" color="surface.text.gray.subtle">SHARE AND COLLECT</Text>
      <div className="tiles">
        {tile(PaymentLinksIcon as never, 'Payment links', 'Collect payments instantly by sharing a simple link', pl ? `${pl.count} created · ${pl.paid} paid` : null)}
        {tile(PaymentPagesIcon as never, 'Payment pages', 'Create a custom branded page to collect payments online')}
        {tile(InvoicesIcon as never, 'Invoices', 'Send professional invoices and get paid faster', inv ? `${inv.count} created · ${inv.paid} paid` : null)}
      </div>
      {!!pl?.recent.length && <>
        <Text size="small" weight="semibold" color="surface.text.gray.subtle">RECENT PAYMENT LINKS</Text>
        <div className="card list">{pl.recent.map(l => (
          <div key={l.id} className="pay-row"><div className="pay-main"><Text weight="semibold">{l.amount_display}</Text><Text size="small" color="surface.text.gray.muted">{l.description || l.id}</Text></div>
            <Badge color={l.status === 'paid' ? 'positive' : 'neutral'} emphasis="subtle" size="small">{l.status}</Badge></div>
        ))}</div>
      </>}
      <Text size="small" weight="semibold" color="surface.text.gray.subtle">ON YOUR WEBSITE</Text>
      <div className="tiles">{tile(QRCodeIcon as never, 'Magic checkout', 'One-click checkout for higher conversion')}</div>
    </TabPage>
  );
}

/* ---------------- Support: RAY ---------------- */

export function SupportTab() {
  const { merchant, base } = useApp();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const disputes = useMerchant(['disputes'], s => merchant.disputes(s), 20_000);
  const [asked, setAsked] = useState<DisputeListItem | null>(null);
  const payment = useQuery({ queryKey: ['merchant', 'payment', asked?.payment_id], queryFn: ({ signal }) => merchant.payment(asked!.payment_id, signal), enabled: !!asked });
  const open = (disputes.data?.items || []).filter(d => d.status === 'open');
  const recent = (disputes.data?.items || []).filter(d => d.status !== 'open').slice(0, 2);
  const p = payment.data;
  return (
    <TabPage root={base} flush header={
      <header className="ray-header"><RayIcon size="large" color="surface.icon.staticWhite.normal" /><Text weight="semibold" color="surface.text.staticWhite.normal">RAY</Text><span className="concept">Concept</span></header>}>
      <div className="chat">
        {disputes.isPending && <Spinner accessibilityLabel="Loading" />}
        {!disputes.isPending && !open.length && <div className="bubble ray"><Text>No disputes need a response right now. I'll message you here and on WhatsApp the moment a customer raises one.</Text></div>}
        {open.map(d => {
          const dl = deadlineParts(d.respond_by_iso, now);
          return (
            <div key={d.id} className="bubble ray">
              <Text>{d.bank_request
                ? `The bank needs more proof for the ${d.amount_display} dispute: ${d.bank_request.reason || 'the evidence was unclear'}.${dl ? ` Respond by ${dl.when}.` : ''}`
                : `You have a dispute on ${d.amount_display}. ${d.reason_label}.${dl ? ` Respond by ${dl.when}.` : ''}`}</Text>
              <div className="bubble-actions">
                <Button size="small" onClick={() => navigate(disputeHref(base, d.id), { state: { openSheet: !d.evidence_files } })}>{d.evidence_files ? 'Continue' : 'Add proof'}</Button>
                <Button size="small" variant="secondary" onClick={() => setAsked(d)}>What was this payment?</Button>
              </div>
            </div>
          );
        })}
        {asked && <>
          <div className="bubble me"><Text>What was this payment?</Text></div>
          <div className="bubble ray">{payment.isPending ? <Spinner accessibilityLabel="Loading" size="medium" /> : p
            ? <Text>{`${p.amount_display} by ${METHOD[p.method] || p.method} on ${paymentDate(p.created_at)}${p.order_ref ? `, order ${p.order_ref}` : ''}${p.contact_masked ? `, from ${p.contact_masked}` : ''}. Payment ID ${p.id}.`}</Text>
            : <Text>I couldn't find that payment.</Text>}</div>
        </>}
        {recent.map(d => (
          <div key={d.id} className="bubble ray"><Text>{d.status === 'under_review' ? `Your response for the ${d.amount_display} dispute is with the bank. I'll tell you when they decide.` : `The ${d.amount_display} dispute is ${d.status}.`}</Text></div>
        ))}
        <Text size="xsmall" color="surface.text.gray.muted">Concept: how dispute alerts could plug into RAY. Submitting always happens on the review screen, never from chat.</Text>
      </div>
      <div className="chat-input"><span>Ask RAY anything…</span></div>
    </TabPage>
  );
}

/* ---------------- Account ---------------- */

export function AccountTab() {
  const { merchant, base: root } = useApp();
  const navigate = useNavigate();
  const prof = useMerchant(['profile'], s => merchant.profile(s), 300_000);
  const name = prof.data?.name && prof.data.name !== 'Your business' ? prof.data.name : MERCHANT_NAME;
  const rows: [ComponentType<{ size?: 'large'; color?: 'surface.icon.gray.normal' }>, string, string, (() => void)?][] = [
    [BankIcon as never, 'Bank accounts and settlements', 'Bank account, Settlement cycle'],
    [GlobeIcon as never, 'Website and app', 'Website/App details, API keys, Webhooks'],
    [CreditCardIcon as never, 'Payments and refunds', 'Balances, Capture and refund settings, Disputes', () => navigate(`${root}/disputes`)],
    [FileIcon as never, 'Business details and GST', 'Business details, GST, Customer support, Manage team'],
    [BellIcon as never, 'Notification', 'Email, SMS, WhatsApp · dispute alerts', () => navigate(`${root}/notifications`)],
    [CreditCardIcon as never, 'Checkout', 'Flash checkout, Branding, Trusted badge'],
  ];
  return (
    <TabPage root={root} title="Account and settings">
      <div className="card profile">
        <div className="profile-top"><span className="avatar">{initials(name)}</span><div><Text size="large" weight="semibold">{name.toUpperCase()}</Text><Text color="surface.text.gray.muted">Owner</Text></div></div>
        {prof.data?.key_id_hint && <div className="mid-box"><Text size="small" color="surface.text.gray.muted">API key (test mode)</Text><span className="mono">{prof.data.key_id_hint}</span></div>}
      </div>
      <div className="card list">
        {rows.map(([Icon, t, s, go]) => (
          <button key={t} className="setting" onClick={go} disabled={!go}><span className="setting-icon"><Icon size="large" color="surface.icon.gray.normal" /></span><div><Text weight="semibold">{t}</Text><Text size="small" color="surface.text.gray.muted">{s}</Text></div><ChevronRightIcon size="medium" color="surface.icon.gray.normal" /></button>
        ))}
      </div>
      <div className="card list"><button className="setting" onClick={() => navigate(`${root}/support`)}><HelpCircleIcon size="large" color="surface.icon.gray.normal" /><div><Text>Support</Text></div><ChevronRightIcon size="medium" color="surface.icon.gray.normal" /></button></div>
    </TabPage>
  );
}

/* ---------------- Notification settings and alert log ---------------- */

const CHANNEL: Record<string, { label: string; icon: ComponentType<{ size?: 'medium'; color?: 'surface.icon.gray.normal' }> }> = {
  in_app: { label: 'In-app', icon: BellIcon as never }, email: { label: 'Email', icon: MailIcon as never }, whatsapp: { label: 'WhatsApp', icon: MessageCircleIcon as never },
};

export function NotificationsScreen() {
  const ws = useApp();
  const navigate = useNavigate();
  const prof = useMerchant(['profile'], s => ws.merchant.profile(s), 300_000);
  const log = useMerchant(['notifications'], s => ws.merchant.notifications(s), 15_000);
  const ch = prof.data?.channels;
  const groups = new Map<string, NotificationItem[]>();
  for (const n of log.data?.items || []) {
    const k = `${n.dispute_id}|${n.kind}`;
    groups.set(k, [...(groups.get(k) || []), n]);
  }
  return (
    <div className="tab-page">
      <header className="page-header with-back">
        <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={() => navigate(`${ws.base}/account`)} />
        <Text size="large" weight="semibold">Notification</Text>
      </header>
      <main className="tab-content">
        <Text size="small" weight="semibold" color="surface.text.gray.subtle">DISPUTE ALERTS</Text>
        <div className="card list">
          <PhoneNotificationsRow />
          <ChannelRow label="In the app" sub="Banner, Home card and the Disputes tab" state="On" ok />
          <ChannelRow label="WhatsApp" sub={ch?.whatsapp.to ? `To ${ch.whatsapp.to}` : 'No number added'} state={ch ? (ch.whatsapp.configured ? 'On' : 'Not set up') : '…'} ok={!!ch?.whatsapp.configured} />
          <ChannelRow label="Email" sub={ch?.email.to ? `To ${ch.email.to}` : 'No email added'} state={ch ? (ch.email.configured ? 'On' : 'Not set up') : '…'} ok={!!ch?.email.configured} />
        </div>
        <Text size="xsmall" color="surface.text.gray.muted">Sent when a dispute is raised and when the bank asks for more proof, with reminders 24 h and 6 h before the deadline until you respond.</Text>
        <Text size="small" weight="semibold" color="surface.text.gray.subtle">RECENT ALERTS</Text>
        {log.isPending ? <Loading /> : log.isError ? <Failed error={log.error} retry={() => void log.refetch()} /> : groups.size ? [...groups.values()].map(g => (
          <button key={`${g[0]!.dispute_id}${g[0]!.kind}`} className="card alert-log" onClick={() => navigate(disputeHref(ws.base, g[0]!.dispute_id))}>
            <Text weight="semibold">{g[0]!.title}</Text>
            <Text size="small" color="surface.text.gray.subtle">{g[0]!.body}</Text>
            <div className="alert-channels">{g.map(n => {
              const C = CHANNEL[n.channel]!;
              return <span key={n.id} className={`ch ch-${n.status}`} title={n.detail || ''}><C.icon size="medium" color="surface.icon.gray.normal" />{C.label} · {n.status === 'sent' ? 'Sent' : n.status === 'failed' ? 'Failed' : 'Not set up'}</span>;
            })}</div>
            {g.filter(n => n.detail).map(n => <Text key={n.id} size="xsmall" color="surface.text.gray.muted">{CHANNEL[n.channel]!.label}: {n.detail}</Text>)}
            {g[0]!.created_at && <Text size="xsmall" color="surface.text.gray.muted">{time(g[0]!.created_at)}</Text>}
          </button>
        )) : <Empty icon={BellIcon} title="No alerts yet" sub="Alerts appear here when a dispute is raised." />}
      </main>
    </div>
  );
}

function ChannelRow({ label, sub, state, ok }: { label: string; sub: string; state: string; ok: boolean }) {
  return (
    <div className="setting">
      {ok ? <CheckCircleIcon size="large" color="feedback.icon.positive.intense" /> : <AlertTriangleIcon size="large" color="surface.icon.gray.muted" />}
      <div><Text weight="semibold">{label}</Text><Text size="small" color="surface.text.gray.muted">{sub}</Text></div>
      <Text size="small" weight="semibold" color={ok ? 'feedback.text.positive.intense' : 'surface.text.gray.muted'}>{state}</Text>
    </div>
  );
}
