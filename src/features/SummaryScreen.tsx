import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Badge, BottomSheet, BottomSheetBody, BottomSheetFooter, BottomSheetHeader, Button, CheckCircleIcon, CircleIcon, Text, TextArea,
} from '@razorpay/blade/components';
import { ApiError } from '../api/client';
import type { CoverageItem } from '../api/types';
import { KV, Panel, Screen, Section, SkeletonBlock, SrOnly, State } from '../components/ui';
import { elapsed, newKey, useNow } from '../lib/format';
import { useWorkspace } from './workspace';

const LABEL_COLOR: Record<string, 'positive' | 'information' | 'notice'> = { 'Good coverage': 'positive', 'Enough to submit': 'information' };

/** Screens 5 and 6 — coverage checklist, editable summary, then approve and submit. */
export function SummaryScreen() {
  const { data, api, root, onAuthError, refresh } = useWorkspace();
  const navigate = useNavigate();
  const now = useNow();
  const cov = useQuery({ queryKey: ['dispute', data.dispute.id, 'coverage'], queryFn: ({ signal }) => api.coverage(signal) });
  const [summary, setSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'submit' | 'draft' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submitKey = useRef(newKey());
  const lastSaved = useRef<string | null>(null);

  useEffect(() => { if (cov.data && summary === null) { setSummary(cov.data.summary.draft); lastSaved.current = cov.data.summary.draft; } }, [cov.data, summary]);
  useEffect(() => { if (cov.error instanceof ApiError && cov.error.isAuth) onAuthError(); }, [cov.error, onAuthError]);

  async function persist() {
    if (summary === null || summary === lastSaved.current) return;
    setSaving('saving');
    try { await api.saveDraft({ summary, contested_amount: cov.data?.contested_amount || data.dispute.amount }); lastSaved.current = summary; setSaving('saved'); }
    catch (e) { setSaving('idle'); setError(e instanceof Error ? e.message : 'Could not save your edit.'); }
  }

  async function send(action: 'submit' | 'draft') {
    setBusy(action); setError(null); setNotice(null);
    try {
      await persist();
      const res = await api.contest(action === 'submit' ? submitKey.current : newKey(), action);
      if (action === 'submit') {
        await refresh();
        navigate(root, { replace: true, state: { submittedSeconds: res.seconds_to_submit ?? null } });
      } else {
        setNotice(`Draft saved on Razorpay with ${res.documents} file${res.documents === 1 ? '' : 's'}. Nothing was sent to the bank.`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.isAuth) { onAuthError(); return; }
      setError(e instanceof Error ? e.message : 'Could not send. Try again.');
      if (action === 'submit') submitKey.current = newKey();
    } finally { setBusy(null); setConfirm(false); }
  }

  if (cov.isPending) return (
    <Screen title="Summary" back={`${root}/review`} step="Step 3 of 3 · Approve">
      <SkeletonBlock lines={4} label="Checking which proof is covered" />
      <SkeletonBlock lines={5} label="Drafting your summary from the evidence" />
      <Text size="small" color="surface.text.gray.muted">Checking your proof against what this dispute needs and drafting the summary.</Text>
    </Screen>
  );
  if (cov.isError) return <Screen title="Summary" back={`${root}/review`}><State title="Could not load the summary" onRetry={() => void cov.refetch()}>{cov.error.message}</State></Screen>;

  const c = cov.data;
  const docs = Object.values(c.fields_with_documents).reduce((n, ids) => n + ids.length, 0);
  const fieldCount = Object.keys(c.fields_with_documents).length;
  const fieldNames = Object.keys(c.fields_with_documents);
  const edited = summary !== null && summary !== c.summary.generated;
  const closed = data.dispute.status !== 'open' || data.dispute.deadline_passed;

  return (
    <Screen title="Summary" back={`${root}/review`} step="Step 3 of 3 · Approve" timer={elapsed(data.run.timer_started_at, now)}
      footer={
        <div className="footer-stack">
          <Button isFullWidth isDisabled={docs === 0 || closed} onClick={() => setConfirm(true)}>Submit response</Button>
          <Button isFullWidth variant="tertiary" isDisabled={closed} isLoading={busy === 'draft'} onClick={() => void send('draft')}>Save as draft</Button>
        </div>
      }>
      <Section title="Coverage" aside={<Badge color={LABEL_COLOR[c.label] || 'notice'} emphasis="subtle">{c.label}</Badge>}>
        <Panel>
          <ul className="checklist" aria-label="Proof this dispute needs">
            {c.required.map(i => <CheckRow key={i.field} item={i} />)}
            {c.helpful.map(i => <CheckRow key={i.field} item={i} optional />)}
          </ul>
        </Panel>
        {c.needs_attention.length > 0 && (
          <Alert color="notice" isDismissible={false} isFullWidth description={`${c.needs_attention.length} file${c.needs_attention.length === 1 ? '' : 's'} still need${c.needs_attention.length === 1 ? 's' : ''} attention and won't be sent as is.`}
            actions={{ primary: { text: 'Fix', onClick: () => navigate(`${root}/review`) } }} />
        )}
        {c.processing.length > 0 && <Text size="small" color="surface.text.gray.muted">{c.processing.length} file still being checked. It will be included once it's ready.</Text>}
      </Section>

      <Section aside={edited && <button className="text-btn" onClick={() => setSummary(c.summary.generated)}><Text size="small" weight="semibold" color="surface.text.primary.normal">Reset</Text></button>}>
        <TextArea label="Summary for the bank" labelPosition="top" value={summary ?? ''} onChange={({ value }) => { setSummary(value || ''); setSaving('idle'); }} onBlur={() => void persist()}
          maxCharacters={c.summary.max_length} numberOfLines={5}
          helpText={saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : 'Written only from the facts on your evidence cards. Edit anything.'} />
      </Section>

      <Panel tone="muted">
        <KV label="Amount contested" value={`${data.dispute.amount_display} (full amount)`} />
        <KV label="Files to send" value={`${docs} across ${fieldCount} field${fieldCount === 1 ? '' : 's'}`} />
      </Panel>
      <Text size="small" weight="semibold" color="surface.text.gray.subtle">Nothing is sent until you approve.</Text>
      <SrOnly role="status" aria-live="polite">{saving === 'saving' ? 'Saving your summary' : saving === 'saved' ? 'Summary saved' : ''}</SrOnly>
      <div role="status" aria-live="polite">{notice && <Alert color="positive" description={notice} isDismissible={false} isFullWidth />}</div>
      <div role="alert">{error && <Alert color="negative" description={error} isDismissible={false} isFullWidth />}</div>

      <BottomSheet isOpen={confirm} onDismiss={() => setConfirm(false)}>
        <BottomSheetHeader title="Send this response to the bank?" />
        <BottomSheetBody>
          <div className="confirm-list" tabIndex={0} role="region" aria-label="What will be sent to the bank">
            <KV label="Files" value={`${docs} across ${fieldCount} field${fieldCount === 1 ? '' : 's'}`} />
            <div className="confirm-fields">{fieldNames.map(f => <code key={f}>{f}</code>)}</div>
            <KV label="Amount contested" value={data.dispute.amount_display} />
            <Text size="small" color="surface.text.gray.muted">Summary</Text>
            <div className="confirm-summary"><Text size="small">{summary || ''}</Text></div>
            {!c.complete && <Alert color="notice" isDismissible={false} isFullWidth description="Some required proof is missing. You can still submit, but the bank may decide against you." />}
            <Text size="xsmall" color="surface.text.gray.muted">You can't edit the response after it's sent.</Text>
          </div>
        </BottomSheetBody>
        <BottomSheetFooter>
          <div className="footer-stack">
            <Button isFullWidth isLoading={busy === 'submit'} onClick={() => void send('submit')}>Confirm and submit</Button>
            <Button isFullWidth variant="tertiary" onClick={() => setConfirm(false)}>Go back</Button>
          </div>
        </BottomSheetFooter>
      </BottomSheet>
    </Screen>
  );
}

function CheckRow({ item, optional }: { item: CoverageItem; optional?: boolean }) {
  const ok = item.state !== 'missing';
  return (
    <li className="check">
      <span aria-hidden="true">{ok ? <CheckCircleIcon size="medium" color="feedback.icon.positive.intense" /> : <CircleIcon size="medium" color="surface.icon.gray.muted" />}</span>
      <Text size="medium" weight={ok ? 'semibold' : 'regular'} color={ok ? 'surface.text.gray.normal' : 'surface.text.gray.muted'}>{item.label}</Text>
      <span className="check-state">
        <Text size="xsmall" color={ok ? (item.state === 'strong' ? 'feedback.text.positive.intense' : 'surface.text.gray.subtle') : optional ? 'surface.text.gray.muted' : 'feedback.text.notice.intense'}>
          {ok ? (item.state === 'strong' ? 'Strong' : 'Added') : optional ? 'Optional' : 'Missing'}
        </Text>
      </span>
    </li>
  );
}
