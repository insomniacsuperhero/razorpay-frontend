import { useNavigate } from 'react-router-dom';
import { Alert, Button, Text } from '@razorpay/blade/components';
import type { EvidenceCard } from '../api/types';
import { FieldTag, Screen, VerdictBadge } from '../components/ui';
import { activeEvidence, bestVerdict, elapsed, isUseful, PROCESSING, useNow } from '../lib/format';
import { EvidenceFile } from './EvidenceFile';
import { useWorkspace } from './workspace';

interface Group { key: string; label: string; field: string | null; role: 'required' | 'helpful' | 'other'; cards: EvidenceCard[] }

/** Screen 4 — Evidence review. One card per evidence type (Razorpay field), not per file. */
export function ReviewScreen() {
  const { data, root, openProofSheet } = useWorkspace();
  const navigate = useNavigate();
  const now = useNow();
  const all = activeEvidence(data);
  const ready = all.filter(c => c.status === 'ready');
  const processing = all.filter(c => PROCESSING.has(c.status));
  const failed = all.filter(c => c.status === 'failed');
  const required = new Set(data.requirements.required.map(r => r.field));
  const labels = Object.fromEntries([...data.requirements.required, ...data.requirements.helpful].map(r => [r.field, r.label]));

  const groups = new Map<string, Group>();
  const notUseful: EvidenceCard[] = [];
  for (const c of ready) {
    const field = c.field && c.field !== 'none' ? c.field : null;
    if (!field || c.verdict === 'not_useful') { notUseful.push(c); continue; }
    const g = groups.get(field) || { key: field, field, label: labels[field] || c.field_label || field, role: required.has(field) ? 'required' : labels[field] ? 'helpful' : 'other', cards: [] };
    g.cards.push(c); groups.set(field, g);
  }
  const flagged = (g: Group) => g.cards.some(c => c.bank_flag);
  const order = { required: 0, helpful: 1, other: 2 };
  const sorted = [...groups.values()].sort((a, b) => Number(flagged(b)) - Number(flagged(a)) || order[a.role] - order[b.role]);
  const useful = ready.filter(isUseful);
  const attention = ready.filter(c => c.verdict === 'needs_attention');
  const bank = data.dispute.bank_request;
  const missing = data.requirements.required.filter(r => !useful.some(c => c.field === r.field));

  return (
    <Screen title="Review evidence" back={root} step="Step 2 of 3 · Check" timer={elapsed(data.run.timer_started_at, now)}
      footer={
        <div className="footer-stack">
          <Button isFullWidth isDisabled={useful.length === 0} onClick={() => navigate(`${root}/summary`)}>Continue to summary</Button>
          <Button isFullWidth variant="tertiary" onClick={openProofSheet}>Add more proof</Button>
        </div>
      }>
      {bank && data.dispute.status === 'open' && (
        <Alert color="notice" title="The bank asked for more proof" isDismissible={false} isFullWidth
          description={`${bank.reason || 'The evidence was unclear.'} Add a clearer file, then submit again.`}
          actions={{ primary: { text: 'Add clearer proof', onClick: openProofSheet } }} />
      )}

      {ready.length > 0 && useful.length === 0 && !bank && (
        <Alert color="notice" isDismissible={false} isFullWidth
          title={`These files don't address "${data.dispute.reason_label.replace(/^Customer says /i, '')}"`}
          description={`Proof that would help: ${[...data.requirements.required, ...data.requirements.helpful].map(r => r.label.toLowerCase()).slice(0, 3).join(', ')}. ${data.requirements.hint}`}
          actions={{ primary: { text: 'Add more proof', onClick: openProofSheet }, secondary: { text: 'Accept dispute instead', onClick: () => navigate(root) } }} />
      )}

      {useful.length > 0 && (
        <div className="review-summary">
          <Text size="small" color="surface.text.gray.subtle">
            {useful.length} useful file{useful.length === 1 ? '' : 's'}
            {attention.length ? ` · ${attention.length} need${attention.length === 1 ? 's' : ''} attention` : ''}
            {missing.length ? ` · still missing: ${missing.map(m => m.label.toLowerCase()).join(', ')}` : ''}
          </Text>
        </div>
      )}

      {processing.length > 0 && (
        <button className="processing-row" onClick={() => navigate(`${root}/checking`)}>
          <span className="pulse-dot" aria-hidden="true" />
          <span className="processing-text">
            <Text size="small" weight="semibold" color="surface.text.primary.normal">Still checking {processing.length} file{processing.length === 1 ? '' : 's'}</Text>
            <Text size="xsmall" color="surface.text.gray.muted">{processing.map(p => p.document_type || p.filename).join(', ')} · they'll appear here when ready. See progress →</Text>
          </span>
        </button>
      )}

      {sorted.map(g => {
        const v = bestVerdict(g.cards);
        return (
          <article key={g.key} className={`evidence-card ${flagged(g) ? 'is-flagged' : ''}`}>
            <header className="evidence-head">
              <div>
                <h2 className="h-reset"><Text as="span" weight="semibold" size="large">{g.label}</Text></h2>
                <div className="evidence-sub">
                  <FieldTag field={g.field} />
                  <Text size="xsmall" color="surface.text.gray.muted">{g.role === 'required' ? 'Required' : g.role === 'helpful' ? 'Helps' : 'Extra'}</Text>
                </div>
              </div>
              <VerdictBadge verdict={v} />
            </header>
            {g.cards.map(c => <EvidenceFile key={c.id} card={c} hideVerdict={g.cards.length === 1} />)}
          </article>
        );
      })}

      {failed.length > 0 && (
        <article className="evidence-card">
          <header className="evidence-head"><h2 className="h-reset"><Text as="span" weight="semibold" size="large">Couldn't read</Text></h2></header>
          {failed.map(c => <EvidenceFile key={c.id} card={c} />)}
        </article>
      )}

      {notUseful.length > 0 && (
        <article className="evidence-card is-muted">
          <header className="evidence-head">
            <h2 className="h-reset"><Text as="span" weight="semibold">Not useful for this dispute</Text></h2>
          </header>
          {notUseful.map(c => <EvidenceFile key={c.id} card={c} compact />)}
        </article>
      )}

      {all.length === 0 && (
        <div className="empty">
          <Text color="surface.text.gray.muted">No proof added yet.</Text>
          <Button variant="secondary" onClick={openProofSheet}>Add proof</Button>
        </div>
      )}
    </Screen>
  );
}
