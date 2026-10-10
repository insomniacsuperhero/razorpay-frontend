import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon, Badge, Button, CheckCircleIcon, CheckIcon, FileTextIcon, ProgressBar, RefreshIcon, SearchIcon, Text, XCircleIcon,
} from '@razorpay/blade/components';
import { Screen, SrOnly, VerdictBadge } from '../components/ui';
import { elapsed, findingLine, PROCESSING, STAGE_TEXT, useNow, VERDICT_LABEL } from '../lib/format';
import { useUploads, type Job } from '../state/uploads';
import { useWorkspace } from './workspace';
import type { EvidenceCard } from '../api/types';

/** The four things that happen to every file, in the seller's words. */
const STEPS = ['Upload', 'Read', 'Check', 'Save'] as const;
const STEP_OF_STATUS: Record<string, number> = { queued: 1, extracting: 1, analysing: 1, validating: 2, uploading: 3 };

function stepOf(job: Job) {
  if (job.phase === 'done') return STEPS.length;
  if (job.phase === 'preparing' || job.phase === 'uploading') return 0;
  return STEP_OF_STATUS[job.card?.status || 'queued'] ?? 1;
}

/** Screen 3 — Checking your proof. Each file shows which of four steps it is on and what has been
 *  found so far, so the seller reads progress instead of watching a spinner. Ready files can be
 *  reviewed straight away; the rest keep checking in the background. */
export function CheckingScreen() {
  const { data, root, openProofSheet } = useWorkspace();
  const { jobs, retry, dismiss } = useUploads();
  const navigate = useNavigate();
  const now = useNow();
  // After a reload the in-memory jobs are gone; fall back to cards the server is still reading.
  const serverOnly = data.evidence.filter(e => !e.removed && PROCESSING.has(e.status) && !jobs.some(j => j.evidenceId === e.id));
  const total = jobs.length + serverOnly.length;
  const finished = jobs.filter(j => j.phase === 'done' || j.phase === 'failed').length;
  const remaining = total - finished;
  const allDone = total > 0 && remaining === 0;
  const readyCount = jobs.filter(j => j.phase === 'done').length
    + data.evidence.filter(e => !e.removed && e.status === 'ready' && !jobs.some(j => j.evidenceId === e.id)).length;
  const percent = total ? Math.round(jobs.reduce((s, j) => s + jobWeight(j), 0) / total) : 0;
  const slowest = Math.max(0, ...jobs.filter(j => j.phase !== 'done' && j.phase !== 'failed').map(j => now - j.startedAt));
  const announcement = useCompletionAnnouncements(jobs, allDone);

  const looking = [
    ...data.requirements.required.map(r => ({ label: r.label, required: true })),
    ...data.requirements.helpful.slice(0, 2).map(r => ({ label: r.label, required: false })),
  ];

  return (
    <Screen title="Checking your proof" back={root} step="Step 1 of 3 · Add" timer={elapsed(data.run.timer_started_at, now)}
      footer={
        <div className="footer-stack">
          <Button isFullWidth isDisabled={readyCount === 0} onClick={() => navigate(`${root}/review`)}>
            {allDone || !total ? 'Review evidence' : readyCount ? `Review ${readyCount} ready now` : 'Review evidence'}
          </Button>
          <Button isFullWidth variant="tertiary" onClick={openProofSheet}>Add more proof</Button>
        </div>
      }>
      <SrOnly role="status" aria-live="polite" aria-atomic="true">{announcement}</SrOnly>

      {total > 0 && (
        <section className="checking-head" aria-labelledby="checking-status">
          <div className="checking-status">
            {allDone
              ? <CheckCircleIcon size="large" color="feedback.icon.positive.intense" />
              : <span className="pulse-dot" aria-hidden="true" />}
            <h2 id="checking-status" className="h-reset">
              <Text as="span" weight="semibold" size="large">
                {allDone ? `All ${total} file${total === 1 ? '' : 's'} checked` : `Checking ${remaining} of ${total} file${total === 1 ? '' : 's'}`}
              </Text>
            </h2>
          </div>
          <ProgressBar value={allDone ? 100 : percent} label={allDone ? 'Checked against the payment' : `${finished} of ${total} done`}
            showPercentage={false} accessibilityLabel={`Checking files: ${finished} of ${total} done`} />
          <Text size="small" color="surface.text.gray.subtle">{waitHint(allDone, slowest, readyCount)}</Text>
        </section>
      )}

      {total === 0 && (
        <div className="empty">
          <Text color="surface.text.gray.muted">No files yet. Add a screenshot, photo or PDF.</Text>
          <Button variant="secondary" onClick={openProofSheet}>Add proof</Button>
        </div>
      )}

      <ul className="findings" aria-label="Your files">
        {jobs.map(j => <JobRow key={j.key} job={j} onRetry={() => retry(j.key)} onDismiss={() => dismiss(j.key)} />)}
        {serverOnly.map(c => <ServerRow key={c.id} card={c} />)}
      </ul>

      {!allDone && total > 0 && looking.length > 0 && (
        <section className="looking" aria-labelledby="looking-title">
          <div className="looking-head">
            <SearchIcon size="medium" color="surface.icon.gray.muted" />
            <h2 id="looking-title" className="h-reset"><Text as="span" weight="semibold">What we're looking for</Text></h2>
          </div>
          <ul className="looking-list">
            {looking.map(l => (
              <li key={l.label}>
                <Text size="small">{l.label}</Text>
                <Text size="xsmall" color={l.required ? 'feedback.text.notice.intense' : 'surface.text.gray.muted'}>{l.required ? 'Needed' : 'Helps'}</Text>
              </li>
            ))}
          </ul>
          {data.requirements.hint && <Text size="xsmall" color="surface.text.gray.muted">{data.requirements.hint}</Text>}
        </section>
      )}

      <Text size="xsmall" color="surface.text.gray.muted">You can leave this screen. Files keep checking, and the ones you've added are kept.</Text>
    </Screen>
  );
}

/** Honest, changing guidance instead of an endless spinner. */
function waitHint(allDone: boolean, slowestMs: number, ready: number) {
  if (allDone) return 'Every file has been read and matched against the payment.';
  if (slowestMs > 40_000) return ready
    ? 'This is taking longer than usual. Start reviewing the ready files; the rest will appear when they finish.'
    : 'This is taking longer than usual. It can happen with long PDFs or a slow network. You can leave and come back.';
  if (slowestMs > 15_000) return 'Almost there. Screenshots with lots of text take a little longer.';
  return 'Most files take 10 to 20 seconds. You can review each one as soon as it is ready.';
}

/** One message for screen readers each time a file finishes, then one when all are done. */
function useCompletionAnnouncements(jobs: Job[], allDone: boolean) {
  const seen = useRef(new Map<string, Job['phase']>());
  const [message, setMessage] = useState('');
  useEffect(() => {
    const lines: string[] = [];
    for (const j of jobs) {
      const before = seen.current.get(j.key);
      if (before !== j.phase && (j.phase === 'done' || j.phase === 'failed')) {
        const name = j.card?.document_type || j.name;
        lines.push(j.phase === 'failed' ? `${name} could not be read.` : `${name} checked: ${j.card?.verdict ? VERDICT_LABEL[j.card.verdict] : 'done'}.`);
      }
      seen.current.set(j.key, j.phase);
    }
    if (lines.length) setMessage(lines.join(' ') + (allDone ? ' All files checked. You can review your evidence.' : ''));
  }, [jobs, allDone]);
  return message;
}

function jobWeight(j: Job) {
  if (j.phase === 'done' || j.phase === 'failed') return 100;
  if (j.phase === 'preparing') return 5;
  if (j.phase === 'uploading') return 5 + j.progress * 0.25;
  return 30 + stepOf(j) * 17;
}

function Thumb({ src }: { src: string | null }) {
  return src ? <img className="thumb" src={src} alt="" /> : <span className="thumb thumb-file"><FileTextIcon size="large" color="surface.icon.gray.muted" /></span>;
}

/** Upload → Read → Check against the payment → Save, with the current step marked for assistive tech. */
function StepTrack({ current, failed }: { current: number; failed?: boolean }) {
  return (
    <ol className={`steps ${failed ? 'steps-failed' : ''}`} aria-label="Progress for this file">
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current && !failed ? 'current' : 'todo';
        return (
          <li key={s} className={`step step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-bar" aria-hidden="true" />
            <span className="step-label">
              {state === 'done' && <CheckIcon size="xsmall" color="feedback.icon.positive.intense" />}
              {s}
              <SrOnly>{state === 'done' ? ' (done)' : state === 'current' ? ' (in progress)' : ''}</SrOnly>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function JobRow({ job, onRetry, onDismiss }: { job: Job; onRetry: () => void; onDismiss: () => void }) {
  const c = job.card;
  const label = c?.document_type || job.name;
  const working = job.phase !== 'done' && job.phase !== 'failed';
  const partial = c && working ? findingLine(c) : '';
  let icon, status, line;
  if (job.phase === 'done' && c) {
    const warn = c.verdict === 'needs_attention' || c.verdict === 'not_useful';
    icon = warn
      ? <AlertTriangleIcon size="medium" color={c.verdict === 'not_useful' ? 'surface.icon.gray.muted' : 'feedback.icon.notice.intense'} />
      : <CheckCircleIcon size="medium" color="feedback.icon.positive.intense" />;
    status = 'Checked';
    line = findingLine(c) || c.reason || 'Checked';
  } else if (job.phase === 'failed') {
    icon = <XCircleIcon size="medium" color="feedback.icon.negative.intense" />;
    status = 'Failed';
    line = job.error || 'Could not read this file.';
  } else {
    icon = null;
    status = 'Checking';
    line = job.phase === 'preparing' ? 'Getting the file ready' : job.phase === 'uploading' ? `Uploading · ${job.progress}%` : STAGE_TEXT[c?.status || 'queued'];
  }
  return (
    <li className={`finding finding-${job.phase}`}>
      <Thumb src={job.thumb} />
      <div className="finding-body">
        <div className="finding-title">
          {icon}
          <Text weight="semibold" truncateAfterLines={1}><SrOnly>{status}: </SrOnly>{label}</Text>
        </div>
        {working && <StepTrack current={stepOf(job)} />}
        <Text size="small" color={job.phase === 'failed' ? 'feedback.text.negative.intense' : 'surface.text.gray.subtle'}>{line}</Text>
        {partial && <Text size="small" weight="semibold" color="feedback.text.positive.intense">Found so far: {partial}</Text>}
        {job.phase === 'done' && c && (
          <div className="finding-meta">
            <VerdictBadge verdict={c.verdict} size="small" />
            {c.razorpay_document_id && <Badge color="neutral" size="small" emphasis="subtle">{c.razorpay_document_id}</Badge>}
          </div>
        )}
        {job.phase === 'failed' && (
          <div className="row-actions">
            <Button size="small" variant="secondary" icon={RefreshIcon} onClick={onRetry} accessibilityLabel={`Retry ${label}`}>Retry</Button>
            <Button size="small" variant="tertiary" onClick={onDismiss} accessibilityLabel={`Continue without ${label}`}>Continue without it</Button>
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
        <div className="finding-title"><Text weight="semibold"><SrOnly>Checking: </SrOnly>{card.filename}</Text></div>
        <StepTrack current={STEP_OF_STATUS[card.status] ?? 1} />
        <Text size="small" color="surface.text.gray.subtle">{STAGE_TEXT[card.status] || 'Working'}</Text>
      </div>
    </li>
  );
}
