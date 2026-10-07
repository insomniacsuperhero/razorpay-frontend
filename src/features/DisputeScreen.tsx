import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Badge, BottomSheet, BottomSheetBody, BottomSheetFooter, BottomSheetHeader, Button, CheckCircleIcon,
  ChevronDownIcon, ChevronUpIcon, Heading, ShieldIcon, Text,
} from '@razorpay/blade/components';
import { ApiError } from '../api/client';
import { KV, Panel, Screen, Section } from '../components/ui';
import { activeEvidence, deadlineParts, elapsed, isUseful, METHOD, newKey, paymentDate, secondsText, useNow } from '../lib/format';
import { useWorkspace } from './workspace';
import { useApp } from './app';

const STATUS_BADGE: Record<string, { text: string; color: 'notice' | 'information' | 'positive' | 'negative' | 'neutral' }> = {
  open: { text: 'Action required', color: 'notice' },
  under_review: { text: 'Under review', color: 'information' },
  won: { text: 'Won', color: 'positive' },
  lost: { text: 'Lost', color: 'negative' },
  closed: { text: 'Closed', color: 'neutral' },
};

/** Screen 1 — Dispute detail (entry point), with screen 7 (Submitted) and side paths A and B shown in place. */
export function DisputeScreen() {
  const { data, api, openProofSheet, startTimer, refresh, onAuthError, root } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { submittedSeconds?: number | null; openSheet?: boolean } };
  const { base } = useApp();
  const sheetAsked = useRef(false);
  useEffect(() => {
    if (location.state?.openSheet && !sheetAsked.current && data.dispute.status === 'open') { sheetAsked.current = true; startTimer(); openProofSheet(); }
  }, [location.state, data.dispute.status, startTimer, openProofSheet]);
  const now = useNow(30_000);
  const [details, setDetails] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const d = data.dispute, p = data.payment;
  const deadline = deadlineParts(d.respond_by_iso, now);
  const badge = d.bank_request && d.status === 'open' ? { text: 'More proof needed', color: 'notice' as const } : STATUS_BADGE[d.status] || STATUS_BADGE.open;
  const evidence = activeEvidence(data);
  const started = evidence.length > 0 && d.status === 'open';
  const contestable = d.can_contest && !d.deadline_passed;

  function addProof() { startTimer(); openProofSheet(); }

  async function accept() {
    setAcceptBusy(true); setAcceptError(null);
    try { await api.accept(newKey()); await refresh(); setAccepting(false); }
    catch (e) { if (e instanceof ApiError && e.isAuth) onAuthError(); else setAcceptError(e instanceof Error ? e.message : 'Could not accept the dispute.'); }
    finally { setAcceptBusy(false); }
  }

  const footer = d.status !== 'open' ? null : !contestable ? (
    <Button isFullWidth isDisabled>Response window closed</Button>
  ) : d.bank_request ? (
    <Button isFullWidth onClick={() => { startTimer(); navigate(`${root}/review`); }}>Add clearer proof</Button>
  ) : started ? (
    <div className="footer-stack">
      <Button isFullWidth onClick={() => navigate(`${root}/review`)}>Continue your response</Button>
    </div>
  ) : (
    <div className="footer-stack">
      {deadline && <div className={`deadline ${deadline.urgent ? 'urgent' : ''}`}><Text size="small" weight="semibold" color={deadline.urgent ? 'feedback.text.notice.intense' : 'surface.text.gray.subtle'}>Respond by {deadline.when} · {deadline.countdown}</Text></div>}
      <Button isFullWidth onClick={addProof}>Add proof from phone</Button>
      <Button isFullWidth variant="tertiary" onClick={() => setAccepting(true)}>Accept dispute</Button>
    </div>
  );

  return (
    <Screen title="Dispute" back={`${base}/disputes`} footer={footer}>
      <div className="hero">
        <div className="hero-top">
          <Text size="small" color="surface.text.gray.muted">Chargeback · {d.id}</Text>
          <Badge color={badge.color} emphasis="subtle">{badge.text}</Badge>
        </div>
        <Heading size="xlarge">{d.amount_display}</Heading>
        <Text size="large" weight="semibold">{d.reason_label}</Text>
        {d.status === 'open' && deadline && (started || d.bank_request || !contestable) && (
          <Text size="small" color={deadline.urgent || deadline.passed ? 'feedback.text.notice.intense' : 'surface.text.gray.subtle'}>
            {deadline.passed ? 'The deadline to respond has passed.' : `Respond by ${deadline.when} · ${deadline.countdown}`}
          </Text>
        )}
      </div>

      {d.status === 'under_review' && <Submitted seconds={location.state?.submittedSeconds ?? null} />}
      {d.status === 'won' && <Alert color="positive" title="The bank decided in your favour" description="No amount was deducted for this dispute." isDismissible={false} isFullWidth />}
      {d.status === 'lost' && <Alert color="negative" title={`${d.amount_display} was deducted`} description="This dispute is closed. You accepted it, or the bank decided for the customer." isDismissible={false} isFullWidth />}

      {d.status === 'open' && d.bank_request && (
        <Alert color="notice" title="The bank asked for more proof" isDismissible={false} isFullWidth
          description={`${d.bank_request.reason || 'The evidence was unclear.'}${deadline ? ` Respond by ${deadline.when}.` : ''}`} />
      )}
      {d.status === 'open' && !contestable && (
        <Alert color="notice" title="The response window has closed" description="Razorpay no longer accepts evidence for this dispute after the deadline." isDismissible={false} isFullWidth />
      )}
      {d.status === 'open' && contestable && !d.bank_request && !started && (
        <Panel tone="muted">
          <Text>Add proof from your phone. We'll check it and organise it for this dispute.</Text>
        </Panel>
      )}
      {started && !d.bank_request && (
        <Panel tone="muted">
          <Text size="small">{evidence.length} file{evidence.length === 1 ? '' : 's'} added · {evidence.filter(isUseful).length} useful for this dispute. Nothing has been sent yet.</Text>
        </Panel>
      )}

      <Section title="Payment" aside={data.payment_verified && <span className="verified"><ShieldIcon size="small" color="feedback.icon.positive.intense" /><Text size="xsmall" color="feedback.text.positive.intense">Verified with Razorpay</Text></span>}>
        <Panel>
          {p ? <>
            <KV label="Amount" value={p.amount_display} />
            <KV label="Paid on" value={paymentDate(p.created_at)} />
            <KV label="Method" value={METHOD[p.method] || p.method} />
            {p.contact_masked && <KV label="Customer" value={p.contact_masked} />}
            {(p.order_ref || p.order_id) && <KV label="Order" value={p.order_ref || p.order_id || ''} mono />}
          </> : <Text size="small" color="surface.text.gray.muted">{data.payment_error || 'Payment details are not available right now.'}</Text>}
        </Panel>
      </Section>

      <button className="details-toggle" onClick={() => setDetails(x => !x)} aria-expanded={details}>
        <Text size="small" weight="semibold" color="surface.text.primary.normal">View details</Text>
        {details ? <ChevronUpIcon size="small" color="surface.icon.primary.normal" /> : <ChevronDownIcon size="small" color="surface.icon.primary.normal" />}
      </button>
      {details && (
        <Panel tone="muted">
          <KV label="Dispute ID" value={d.id} mono />
          <KV label="Reason code" value={d.reason_code} mono />
          <KV label="Phase" value={d.phase || 'chargeback'} />
          {p && <KV label="Payment ID" value={p.id} mono />}
        </Panel>
      )}

      <BottomSheet isOpen={accepting} onDismiss={() => setAccepting(false)}>
        <BottomSheetHeader title="Accept this dispute?" />
        <BottomSheetBody>
          <Text>{d.amount_display} will be deducted from your settlements. This can't be undone.</Text>
          {acceptError && <div className="gap-top"><Alert color="negative" description={acceptError} isDismissible={false} isFullWidth /></div>}
        </BottomSheetBody>
        <BottomSheetFooter>
          <div className="footer-stack">
            <Button isFullWidth color="negative" isLoading={acceptBusy} onClick={accept}>{`Accept and deduct ${d.amount_display}`}</Button>
            <Button isFullWidth variant="tertiary" onClick={() => setAccepting(false)}>Keep the dispute open</Button>
          </div>
        </BottomSheetFooter>
      </BottomSheet>
    </Screen>
  );
}

/** Screen 7 — quiet inline success, no celebration screen. */
function Submitted({ seconds }: { seconds: number | null }) {
  const { data } = useWorkspace();
  const taken = seconds != null ? secondsText(seconds) : elapsed(data.run.timer_started_at, data.run.submitted_at);
  const fields = Object.entries(data.dispute.evidence_on_record).filter(([k, v]) => Array.isArray(v) && v.length && k !== 'others');
  return (
    <Panel tone="success">
      <div className="success-head">
        <CheckCircleIcon size="xlarge" color="feedback.icon.positive.intense" />
        <div>
          <Text weight="semibold" size="large">Response sent</Text>
          <Text size="small" color="surface.text.gray.subtle">Under review · We'll message you when the bank decides.</Text>
        </div>
      </div>
      {taken && <div className="taken"><Text size="small" color="surface.text.gray.muted">Time from Add proof to submitted</Text><Text weight="semibold">{taken}</Text></div>}
      {fields.length > 0 && <Text size="xsmall" color="surface.text.gray.muted">Sent: {fields.map(([k, v]) => `${k} (${(v as unknown[]).length})`).join(' · ')}</Text>}
    </Panel>
  );
}
