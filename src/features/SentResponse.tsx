import { Badge, Text } from '@razorpay/blade/components';
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

/** Dispute screen, after submitting: the response that was sent and every proof with its label. */
export function SentResponse({ onRecord, evidence, amountDisplay }: {
  onRecord: Record<string, unknown>; evidence: EvidenceCard[]; amountDisplay: string;
}) {
  const summary = typeof onRecord.summary === 'string' ? onRecord.summary : null;
  const amount = typeof onRecord.amount === 'number' ? onRecord.amount : null;
  const at = typeof onRecord.submitted_at === 'number' ? onRecord.submitted_at : null;
  const sent = sentDocIds(onRecord);
  const cards = byVerdict(evidence.filter(c => !c.removed && c.status === 'ready'));
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
        <Section title={`Proofs (${cards.length})`}>
          <div className="proof-list">
            {cards.map(c => {
              const wasSent = !!c.razorpay_document_id && sent.has(c.razorpay_document_id);
              return (
                <div key={c.id} className="proof-row">
                  <div className="proof-row-head">
                    <div className="proof-row-title">
                      <Text size="small" weight="semibold" truncateAfterLines={2}>{c.document_type || c.filename}</Text>
                      <Text size="xsmall" color="surface.text.gray.muted" truncateAfterLines={1}>{c.filename}</Text>
                    </div>
                    <VerdictBadge verdict={c.verdict} size="small" />
                  </div>
                  {c.reason && <Text size="xsmall" color="surface.text.gray.subtle">{c.reason}</Text>}
                  <div className="proof-row-foot">
                    <FieldTag field={c.field} />
                    <Badge size="xsmall" color={wasSent ? 'positive' : 'neutral'} emphasis="subtle">{wasSent ? 'Sent to bank' : 'Not sent'}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </>
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
