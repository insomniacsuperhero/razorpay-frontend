import { useState } from 'react';
import { Badge, ChevronDownIcon, ChevronUpIcon, EyeIcon, FileTextIcon, Text } from '@razorpay/blade/components';
import type { EvidenceCard } from '../api/types';
import { FieldTag, Panel, Section, VerdictBadge } from '../components/ui';
import { paymentDate, type Verdict } from '../lib/format';

const RANK: Record<Verdict, number> = { strong: 0, relevant: 1, needs_attention: 2, not_useful: 3 };
const byVerdict = <T extends { verdict?: Verdict | null }>(xs: T[]) =>
  [...xs].sort((a, b) => (a.verdict ? RANK[a.verdict] : 9) - (b.verdict ? RANK[b.verdict] : 9));

/** Every doc_ id that went to the bank, from the dispute's evidence on record. */
export function sentDocIds(onRecord: Record<string, unknown>) {
  const ids = new Set<string>();
  for (const [k, v] of Object.entries(onRecord)) {
    if (!Array.isArray(v)) continue;
    if (k === 'others') v.forEach(o => (o as { document_ids?: string[] })?.document_ids?.forEach(id => ids.add(id)));
    else v.forEach(id => typeof id === 'string' && ids.add(id));
  }
  return ids;
}

/** Dispute screen, after submitting: the response that was sent, then every proof (collapsed by
 *  default) split into what went to the bank and what did not, with the uploaded file itself. */
export function SentResponse({ onRecord, evidence, amountDisplay }: {
  onRecord: Record<string, unknown>; evidence: EvidenceCard[]; amountDisplay: string;
}) {
  const [open, setOpen] = useState(false);
  const summary = typeof onRecord.summary === 'string' ? onRecord.summary : null;
  const amount = typeof onRecord.amount === 'number' ? onRecord.amount : null;
  const at = typeof onRecord.submitted_at === 'number' ? onRecord.submitted_at : null;
  const sentIds = sentDocIds(onRecord);
  const cards = byVerdict(evidence.filter(c => !c.removed && (c.status === 'ready' || c.status === 'failed')));
  const wasSent = (c: EvidenceCard) => !!c.razorpay_document_id && sentIds.has(c.razorpay_document_id);
  const sent = cards.filter(wasSent), notSent = cards.filter(c => !wasSent(c));
  return (
    <>
      <Section title="What you sent">
        <Panel>
          {summary ? <Text size="small">{summary}</Text> : <Text size="small" color="surface.text.gray.muted">No written summary was sent.</Text>}
          <div className="sent-meta">
            <Text size="xsmall" color="surface.text.gray.muted">
              Contested {amount != null ? `₹${(amount / 100).toLocaleString('en-IN')}` : amountDisplay}{at ? ` · sent ${paymentDate(at)}` : ''}
            </Text>
          </div>
        </Panel>
      </Section>
      {cards.length > 0 && (
        <section className="section">
          <button className="proofs-toggle" onClick={() => setOpen(x => !x)} aria-expanded={open} aria-controls="sent-proofs">
            <span className="proofs-toggle-text">
              <Text weight="semibold">Proofs ({cards.length})</Text>
              <Text size="xsmall" color="surface.text.gray.muted">{sent.length} sent to the bank · {notSent.length} not sent</Text>
            </span>
            {open ? <ChevronUpIcon size="medium" color="surface.icon.gray.muted" /> : <ChevronDownIcon size="medium" color="surface.icon.gray.muted" />}
          </button>
          {open && (
            <div id="sent-proofs" className="proof-groups">
              <ProofGroup title="Sent to the bank" note="Attached to your response as evidence." cards={sent} sent />
              <ProofGroup title="Not sent" note="Kept out of the response because it didn't help this dispute or couldn't be read." cards={notSent} />
            </div>
          )}
        </section>
      )}
    </>
  );
}

function ProofGroup({ title, note, cards, sent }: { title: string; note: string; cards: EvidenceCard[]; sent?: boolean }) {
  if (!cards.length) return null;
  return (
    <div className="proof-group">
      <div className="proof-group-head">
        <Badge size="small" color={sent ? 'positive' : 'neutral'} emphasis="subtle">{`${title} · ${cards.length}`}</Badge>
        <Text size="xsmall" color="surface.text.gray.muted">{note}</Text>
      </div>
      <div className="proof-list">{cards.map(c => <ProofRow key={c.id} card={c} sent={!!sent} />)}</div>
    </div>
  );
}

function ProofRow({ card: c, sent }: { card: EvidenceCard; sent: boolean }) {
  const isImage = (c.detected_mime_type || '').startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(c.filename);
  const thumb = c.preview_url && isImage
    ? <img className="proof-thumb" src={c.preview_url} alt={`Uploaded file ${c.filename}`} loading="lazy" />
    : <span className="proof-thumb proof-thumb-file"><FileTextIcon size="large" color="surface.icon.gray.muted" /></span>;
  return (
    <div className={`proof-row ${sent ? '' : 'proof-row-muted'}`}>
      <div className="proof-row-main">
        {c.preview_url ? <a href={c.preview_url} target="_blank" rel="noreferrer" aria-label={`Open ${c.filename}`}>{thumb}</a> : thumb}
        <div className="proof-row-body">
          <div className="proof-row-head">
            <div className="proof-row-title">
              <Text size="small" weight="semibold" truncateAfterLines={2}>{c.document_type || c.filename}</Text>
              <Text size="xsmall" color="surface.text.gray.muted" truncateAfterLines={1}>{c.filename}</Text>
            </div>
            {c.status === 'failed'
              ? <Badge size="small" color="negative" emphasis="subtle">Couldn't read</Badge>
              : <VerdictBadge verdict={c.verdict} size="small" />}
          </div>
          {(c.status === 'failed' ? c.error?.message : c.reason) && (
            <Text size="xsmall" color="surface.text.gray.subtle">{c.status === 'failed' ? c.error?.message : c.reason}</Text>
          )}
          <div className="proof-row-foot">
            <FieldTag field={c.field} />
            {sent && c.razorpay_document_id && <span className="mono proof-doc">{c.razorpay_document_id}</span>}
            {c.preview_url && <a className="link-btn" href={c.preview_url} target="_blank" rel="noreferrer"><EyeIcon size="small" color="surface.icon.primary.normal" /><Text size="xsmall" weight="semibold" color="surface.text.primary.normal">Open</Text></a>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Disputes list card: a compact view of the proofs and the response that went out. */
export function SentPreview({ proofs, summary }: {
  proofs: { label: string; verdict: Verdict | null }[]; summary?: string | null;
}) {
  const shown = byVerdict(proofs).slice(0, 3);
  const more = proofs.length - shown.length;
  return (
    <div className="sent-preview">
      {shown.map((p, i) => (
        <div key={i} className="sent-preview-row">
          <Text size="small" truncateAfterLines={1}>{p.label}</Text>
          <VerdictBadge verdict={p.verdict} size="small" />
        </div>
      ))}
      {more > 0 && <Text size="xsmall" color="surface.text.gray.muted">+{more} more</Text>}
      {summary && <Text size="xsmall" color="surface.text.gray.subtle" truncateAfterLines={2}>Response sent: “{summary}”</Text>}
    </div>
  );
}
