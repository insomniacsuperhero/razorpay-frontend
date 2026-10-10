import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { fileMime, type DisputeApi } from '../api/workflow';
import type { EvidenceCard } from '../api/types';
import { prepareFile } from '../lib/image';
import { newKey, PROCESSING } from '../lib/format';

/** One file the seller picked on this visit. Lives in memory for the whole flow, so going
 *  back or forward between screens never loses an upload (spec: "Recover, don't restart"). */
export interface Job {
  key: string;
  file: File;
  name: string;
  thumb: string | null;
  phase: 'preparing' | 'uploading' | 'reading' | 'done' | 'failed';
  progress: number;
  /** When this attempt began, so the screen can say when a file is taking longer than usual. */
  startedAt: number;
  evidenceId?: string;
  card?: EvidenceCard;
  error?: string;
}

interface UploadState {
  jobs: Job[];
  add: (files: File[]) => void;
  retry: (key: string) => void;
  dismiss: (key: string) => void;
  busy: boolean;
}

const Ctx = createContext<UploadState | null>(null);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function UploadProvider({ api, children, onAuthError }: { api: DisputeApi; children: ReactNode; onAuthError: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const client = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const patch = useCallback((key: string, p: Partial<Job>) => {
    if (alive.current) setJobs(js => js.map(j => (j.key === key ? { ...j, ...p } : j)));
  }, []);

  const poll = useCallback(async (key: string, evidenceId: string) => {
    for (let i = 0; i < 120 && alive.current; i++) {
      const card = await api.evidence(evidenceId);
      patch(key, { card });
      if (!PROCESSING.has(card.status)) {
        patch(key, card.status === 'failed'
          ? { phase: 'failed', error: card.error?.message || 'We could not read this file.' }
          : { phase: 'done' });
        return;
      }
      await sleep(i < 10 ? 1200 : 2500);
    }
  }, [api, patch]);

  const run = useCallback(async (job: Job) => {
    try {
      if (job.evidenceId) {                       // the file is already uploaded: just read it again
        patch(job.key, { phase: 'reading', error: undefined, startedAt: Date.now() });
        await api.retryEvidence(job.evidenceId);
        await poll(job.key, job.evidenceId);
      } else {
        patch(job.key, { phase: 'preparing', error: undefined, progress: 0, startedAt: Date.now() });
        const file = await prepareFile(job.file);
        fileMime(file);                             // clear message for HEIC, empty or oversized files
        patch(job.key, { phase: 'uploading' });
        const ctrl = new AbortController();
        const slot = await api.createUpload(file);
        await api.putFile(slot, file, p => patch(job.key, { progress: p }), ctrl.signal);
        const done = await api.completeUpload(slot.upload_id);
        patch(job.key, { phase: 'reading', evidenceId: done.evidence_id, progress: 100 });
        await poll(job.key, done.evidence_id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.isAuth) { onAuthError(); return; }
      patch(job.key, { phase: 'failed', error: e instanceof Error ? e.message : 'Something went wrong. Retry this file.' });
    } finally {
      void client.invalidateQueries({ queryKey: ['dispute'] });
    }
  }, [api, client, onAuthError, patch, poll]);

  const add = useCallback((files: File[]) => {
    const fresh: Job[] = files.map(file => ({
      key: newKey(), file, name: file.name,
      thumb: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      phase: 'preparing', progress: 0, startedAt: Date.now(),
    }));
    setJobs(js => [...js, ...fresh]);
    fresh.forEach(j => void run(j));
  }, [run]);

  const retry = useCallback((key: string) => {
    const job = jobs.find(j => j.key === key);
    if (job) void run(job);
  }, [jobs, run]);

  const dismiss = useCallback((key: string) => setJobs(js => js.filter(j => j.key !== key)), []);
  const busy = jobs.some(j => j.phase !== 'done' && j.phase !== 'failed');

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  return <Ctx.Provider value={{ jobs, add, retry, dismiss, busy }}>{children}</Ctx.Provider>;
}

export function useUploads() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUploads outside UploadProvider');
  return v;
}
