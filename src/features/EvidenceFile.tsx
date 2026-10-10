import { useState } from 'react';
import {
  Badge, Button, CheckIcon, EditIcon, EyeIcon, FileTextIcon, IconButton, RefreshIcon, Text, TextInput, TrashIcon,
} from '@razorpay/blade/components';
import { ApiError } from '../api/client';
import type { EvidenceCard, EvidenceFact, EvidencePatch } from '../api/types';
import { VerdictBadge } from '../components/ui';
import { useWorkspace } from './workspace';

/** One file inside an evidence card: what it is, its facts with their source, and the fixes the seller can make. */
export function EvidenceFile({ card: c, compact, hideVerdict }: { card: EvidenceCard; compact?: boolean; hideVerdict?: boolean }) {
  const { api, refresh, onAuthError, openProofSheet } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name); setError(null);
    try { await fn(); await refresh(); }
    catch (e) { if (e instanceof ApiError && e.isAuth) onAuthError(); else setError(e instanceof Error ? e.message : 'That did not work. Try again.'); }
    finally { setBusy(null); }
  }
  const patch = (name: string, body: EvidencePatch) => act(name, () => api.patchEvidence(c.id, body));
  const remove = () => act('remove', () => api.removeEvidence(c.id));
  const isImage = (c.detected_mime_type || '').startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(c.filename);
  const bankReason = typeof c.bank_flag === 'string' ? c.bank_flag : c.bank_flag?.reason;
  const mismatchFor = (key: string) => c.mismatches?.find(m => m.fact === key);

  return (
    <div className={`file ${compact ? 'file-compact' : ''}`}>
      <div className="file-head">
        {c.preview_url && isImage
          ? <a href={c.preview_url} target="_blank" rel="noreferrer"><img className="thumb" src={c.preview_url} alt={`Preview of ${c.filename}`} /></a>
          : <span className="thumb thumb-file"><FileTextIcon size="large" color="surface.icon.gray.muted" /></span>}
        <div className="file-title">
          <Text weight="semibold" truncateAfterLines={2}>{c.document_type || c.filename}</Text>
          <Text size="xsmall" color="surface.text.gray.muted" truncateAfterLines={1}>{c.filename}</Text>
        </div>
        {!compact && !hideVerdict && c.verdict && c.status === 'ready' && <VerdictBadge verdict={c.verdict} size="small" />}
      </div>

      {c.status === 'failed' ? (
        <Text size="small" color="feedback.text.negative.intense">{c.error?.message || 'We could not read this file.'}</Text>
      ) : c.reason && (
        <Text size="small" color={c.verdict === 'needs_attention' ? 'feedback.text.notice.intense' : 'surface.text.gray.subtle'}>{c.reason}</Text>
      )}

      {bankReason && !(c.reason || '').includes(bankReason) && (
        <div className="flag-line"><Text size="small" weight="semibold" color="feedback.text.notice.intense">Bank: {bankReason}</Text></div>
      )}

      {c.question && (
        <div className="question">
          <Text size="small" weight="semibold">{c.question}</Text>
          <div className="row-actions">
            <Button size="small" variant="secondary" isLoading={busy === 'yes'} onClick={() => patch('yes', { answer: 'yes' })}>Yes</Button>
            <Button size="small" variant="secondary" isLoading={busy === 'no'} onClick={() => patch('no', { answer: 'no' })}>No</Button>
          </div>
        </div>
      )}

      {!compact && !!c.facts?.length && (
        <dl className="facts">
          {c.facts.map(f => editing === f.key
            ? <div key={f.key} className="fact-editing"><dt className="sr-only">{f.label}</dt><dd><FactEditor fact={f} busy={busy === 'fact'} onCancel={() => setEditing(null)}
                onSave={value => patch('fact', { fact_key: f.key, value }).then(() => setEditing(null))} /></dd></div>
            : <FactRow key={f.key} fact={f} mismatch={mismatchFor(f.key)?.message} expected={mismatchFor(f.key)?.expected} onEdit={() => setEditing(f.key)} />)}
        </dl>
      )}
      {!compact && !!c.facts?.length && (
        <Text size="xsmall" color="surface.text.gray.muted">From {c.filename}</Text>
      )}

      {c.razorpay_document_id && !compact && (
        <Text size="xsmall" color="surface.text.gray.muted">Saved to Razorpay as <span className="mono">{c.razorpay_document_id}</span> · not sent until you submit</Text>
      )}

      <div role="alert">{error && <Text size="small" color="feedback.text.negative.intense">{error}</Text>}</div>

      <div className="row-actions">
        {c.status === 'failed' && <Button size="small" variant="secondary" icon={RefreshIcon} isLoading={busy === 'retry'} onClick={() => act('retry', () => api.retryEvidence(c.id))}>Try again</Button>}
        {c.verdict === 'needs_attention' && !!c.mismatches?.length && !c.merchant_confirmed && (
          <Button size="small" variant="secondary" icon={CheckIcon} isLoading={busy === 'confirm'} onClick={() => patch('confirm', { confirm: true })}>It belongs to this order</Button>
        )}
        {(c.verdict === 'needs_attention' || c.bank_flag || c.status === 'failed') && (
          <Button size="small" variant="secondary" onClick={() => { void remove().then(openProofSheet); }}>Replace</Button>
        )}
        {c.bank_flag && <Button size="small" variant="tertiary" isLoading={busy === 'bank'} onClick={() => patch('bank', { clear_bank_flag: true })}>Keep as is</Button>}
        {c.preview_url && <a className="link-btn" href={c.preview_url} target="_blank" rel="noreferrer"><EyeIcon size="small" color="surface.icon.primary.normal" /><Text size="small" weight="semibold" color="surface.text.primary.normal">Open</Text></a>}
        <span className="spacer" />
        <IconButton icon={TrashIcon} size="medium" accessibilityLabel={`Remove ${c.filename}`} isDisabled={busy === 'remove'} onClick={() => void remove()} />
      </div>
    </div>
  );
}

function FactRow({ fact, mismatch, expected, onEdit }: { fact: EvidenceFact; mismatch?: string; expected?: unknown; onEdit: () => void }) {
  return (
    <div className={`fact ${mismatch ? 'fact-bad' : ''}`}>
      <dt><Text size="small" color="surface.text.gray.muted">{fact.label}</Text></dt>
      <dd>
        <span className="fact-value">
          <Text size="small" weight="medium">{String(fact.display)}</Text>
          {fact.matches_payment && <Badge size="xsmall" color="positive" emphasis="subtle" icon={CheckIcon}>Matches payment</Badge>}
          {fact.edited && <Badge size="xsmall" color="neutral" emphasis="subtle">Edited</Badge>}
        </span>
        {mismatch && <Text size="xsmall" color="feedback.text.notice.intense">{mismatch}{expected ? ` Payment: ${String(expected)}.` : ''}</Text>}
      </dd>
      <dd className="fact-action"><IconButton icon={EditIcon} size="medium" accessibilityLabel={`Correct ${fact.label}`} onClick={onEdit} /></dd>
    </div>
  );
}

function FactEditor({ fact, busy, onSave, onCancel }: { fact: EvidenceFact; busy: boolean; onSave: (v: string | number | null) => void; onCancel: () => void }) {
  const isAmount = fact.key === 'amount_paise';
  const isDate = /date/.test(fact.key);
  const [value, setValue] = useState(isAmount && typeof fact.value === 'number' ? String(fact.value / 100) : String(fact.value ?? ''));
  const save = () => onSave(value.trim() === '' ? null : isAmount ? Math.round(parseFloat(value.replace(/[₹,\s]/g, '')) * 100) : value.trim());
  return (
    <div className="fact-edit">
      <TextInput label={fact.label} value={value} onChange={({ value: v }) => setValue(v || '')} type={isDate ? 'text' : 'text'}
        helpText={isAmount ? 'In rupees' : isDate ? 'YYYY-MM-DD' : undefined} autoFocus />
      <div className="row-actions">
        <Button size="small" isLoading={busy} onClick={save}>Save</Button>
        <Button size="small" variant="tertiary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
