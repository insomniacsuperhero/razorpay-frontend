import { useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon, Badge, Button, CheckCircleIcon, FileTextIcon, ProgressBar, RefreshIcon, Skeleton, Spinner, Text, XCircleIcon,
} from '@razorpay/blade/components';
import { Screen, VerdictBadge } from '../components/ui';
import { elapsed, findingLine, PROCESSING, STAGE_TEXT, useNow } from '../lib/format';
import { useUploads, type Job } from '../state/uploads';
import { useWorkspace } from './workspace';
import type { EvidenceCard } from '../api/types';

/** Screen 3 — Checking your proof. Shows what was found per file as it happens, not a spinner. */
export function CheckingScreen() {
  const { data, root, openProofSheet } = useWorkspace();
  const { jobs, retry, dismiss } = useUploads();
  const navigate = useNavigate();
  const now = useNow();
  // After a reload the in-memory jobs are gone; fall back to cards the server is still reading.
  const serverOnly = data.evidence.filter(e => !e.removed && PROCESSING.has(e.status) && !jobs.some(j => j.evidenceId === e.id));
  const total = jobs.length + serverOnly.length;
  const finished = jobs.filter(j => j.phase === 'done' || j.phase === 'failed').length;
  const allDone = total > 0 && finished === total;
  const anyReady = jobs.some(j => j.phase === 'done') || data.evidence.some(e => !e.removed && e.status === 'ready');
  const percent = total ? Math.round(jobs.reduce((s, j) => s + jobWeight(j), 0) / total) : 0;
  const hint = data.dispute.reason_label.toLowerCase().includes('never arrived') ? 'delivery proof' : 'proof for this dispute';

  return (
    <Screen title="Checking your proof" back={root} step="Step 1 of 3 · Add" timer={elapsed(data.run.timer_started_at, now)}
      footer={
        <div className="footer-stack">
          <Button isFullWidth isDisabled={!anyReady} onClick={() => navigate(`${root}/review`)}>
            {allDone || !total ? 'Review evidence' : `Review evidence (${finished} of ${total} ready)`}
          </Button>
          <Button isFullWidth variant="tertiary" onClick={openProofSheet}>Add more proof</Button>
        </div>
      }>
      <div className="checking-head">
        <Text size="small" color="surface.text.gray.subtle">
          {allDone ? 'All files checked against the payment.' : `Reading each file and looking for ${hint}. You can keep adding files.`}
        </Text>
        <ProgressBar value={allDone ? 100 : percent} label={allDone ? 'Done' : `${finished} of ${total} checked`} showPercentage={false} />
      </div>
      {total === 0 && (
        <div className="empty">
          <Text color="surface.text.gray.muted">No files yet. Add a screenshot, photo or PDF.</Text>
          <Button variant="secondary" onClick={openProofSheet}>Add proof</Button>
        </div>
      )}
      <ul className="findings">
        {jobs.map(j => <JobRow key={j.key} job={j} onRetry={() => retry(j.key)} onDismiss={() => dismiss(j.key)} />)}
        {serverOnly.map(c => <ServerRow key={c.id} card={c} />)}
      </ul>
      <Text size="xsmall" color="surface.text.gray.muted">Going back keeps the files you've already added.</Text>
    </Screen>
  );
}

function jobWeight(j: Job) {
  if (j.phase === 'done' || j.phase === 'failed') return 100;
  if (j.phase === 'preparing') return 5;
  if (j.phase === 'uploading') return 5 + j.progress * 0.35;
  const stage = j.card?.stage_index ?? 0;
  return 45 + stage * 10;
}

function Thumb({ src }: { src: string | null }) {
  return src ? <img className="thumb" src={src} alt="" /> : <span className="thumb thumb-file"><FileTextIcon size="large" color="surface.icon.gray.muted" /></span>;
}

function JobRow({ job, onRetry, onDismiss }: { job: Job; onRetry: () => void; onDismiss: () => void }) {
  const c = job.card;
  const label = c?.document_type || job.name;
  let icon, line;
  if (job.phase === 'done' && c) {
    icon = c.verdict === 'needs_attention' || c.verdict === 'not_useful'
      ? <AlertTriangleIcon size="medium" color={c.verdict === 'not_useful' ? 'surface.icon.gray.muted' : 'feedback.icon.notice.intense'} />
      : <CheckCircleIcon size="medium" color="feedback.icon.positive.intense" />;
    line = findingLine(c) || c.reason || 'Checked';
  } else if (job.phase === 'failed') {
    icon = <XCircleIcon size="medium" color="feedback.icon.negative.intense" />;
    line = job.error || 'Could not read this file.';
  } else {
    icon = <Spinner size="medium" accessibilityLabel="Working" />;
    line = job.phase === 'preparing' ? 'Getting the file ready' : job.phase === 'uploading' ? `Uploading · ${job.progress}%` : STAGE_TEXT[c?.status || 'queued'];
  }
  return (
    <li className={`finding finding-${job.phase}`}>
      <Thumb src={job.thumb} />
      <div className="finding-body">
        <div className="finding-title">{icon}<Text weight="semibold" truncateAfterLines={1}>{label}</Text></div>
        <Text size="small" color={job.phase === 'failed' ? 'feedback.text.negative.intense' : 'surface.text.gray.subtle'}>{line}</Text>
        {job.phase === 'done' && c && (
          <div className="finding-meta">
            <VerdictBadge verdict={c.verdict} size="small" />
            {c.razorpay_document_id && <Badge color="neutral" size="small" emphasis="subtle">{c.razorpay_document_id}</Badge>}
          </div>
        )}
        {(job.phase === 'reading' || job.phase === 'uploading') && !c?.facts?.length && <Skeleton width="70%" height="10px" borderRadius="medium" />}
        {job.phase === 'failed' && (
          <div className="row-actions">
            <Button size="small" variant="secondary" icon={RefreshIcon} onClick={onRetry}>Retry</Button>
            <Button size="small" variant="tertiary" onClick={onDismiss}>Continue without it</Button>
          </div>
        )}
      </div>
    </li>
  );
}

function ServerRow({ card }: { card: EvidenceCard }) {
  return (
    <li className="finding">
      <Thumb src={null} />
      <div className="finding-body">
        <div className="finding-title"><Spinner size="medium" accessibilityLabel="Working" /><Text weight="semibold">{card.filename}</Text></div>
        <Text size="small" color="surface.text.gray.subtle">{STAGE_TEXT[card.status] || 'Working'}</Text>
      </div>
    </li>
  );
}
