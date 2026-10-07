import { ApiError, request } from './client';
import { getDispute, acceptDispute } from './disputes';
import type { Coverage, ContestResponse, Draft, EvidenceCard, EvidencePatch, UploadSlot } from './types';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
export function fileMime(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (extension === 'heic' || extension === 'heif' || /hei[cf]/.test(file.type)) throw new Error('Convert this HEIC photo to JPG or PNG before adding it.');
  if (!MIME[extension] || (file.type && file.type !== MIME[extension] && !(extension === 'jpg' && file.type === 'image/jpg'))) throw new Error('Choose a JPG, PNG, PDF or Word (.docx) file.');
  if (file.size === 0) throw new Error('This file is empty. Choose another file.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose a file smaller than 100 MB.');
  if (file.name.length > 200) throw new Error('Shorten this filename to 200 characters or fewer.');
  return MIME[extension];
}
// Storage has its own signed authorization. Never forward the API bearer token to R2.
export function putFile(slot: UploadSlot, file: File, onProgress: (percent: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(slot.put_url);
    if (url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) { reject(new Error('The service returned an unsafe upload URL.')); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => { signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    xhr.open('PUT', slot.put_url); xhr.timeout = 180000; xhr.withCredentials = false;
    for (const [name, value] of Object.entries(slot.headers)) {
      if (name.toLowerCase() === 'authorization' || name.toLowerCase() === 'cookie') { reject(new Error('Invalid upload authorization headers.')); return; }
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error(xhr.status === 403 ? 'The upload link expired. Retry to get a new link.' : 'The file could not be uploaded. Check your connection and retry.'));
    xhr.onerror = () => finish(new Error('Upload connection failed. Please retry.'));
    xhr.ontimeout = () => finish(new Error('Upload timed out. Please retry on a stable connection.'));
    xhr.onabort = () => finish(new DOMException('Upload cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { finish(new DOMException('Upload cancelled', 'AbortError')); return; }
    xhr.send(file);
  });
}
export function createDisputeApi(id: string, token: string) {
  const base = `/disputes/${encodeURIComponent(id)}`;
  return {
    detail: (signal?: AbortSignal) => getDispute(id, token, signal),
    accept: (key: string) => acceptDispute(id, token, key),
    startTimer: () => request<{ timer_started_at: string }>(`${base}/timer/start`, { method: 'POST', token }),
    createUpload: (file: File, signal?: AbortSignal) => request<UploadSlot>(`${base}/uploads`, { method: 'POST', token, signal, body: { filename: file.name, mime_type: fileMime(file), size_bytes: file.size } }),
    putFile,
    completeUpload: (uploadId: string, signal?: AbortSignal) => request<{ evidence_id: string; status: string }>(`${base}/uploads/${encodeURIComponent(uploadId)}/complete`, { method: 'POST', token, signal, body: {} }),
    evidence: (evidenceId: string, signal?: AbortSignal) => request<EvidenceCard>(`${base}/evidence/${encodeURIComponent(evidenceId)}`, { token, signal }),
    patchEvidence: (evidenceId: string, body: EvidencePatch) => request<EvidenceCard>(`${base}/evidence/${encodeURIComponent(evidenceId)}`, { method: 'PATCH', token, body }),
    retryEvidence: (evidenceId: string) => request<{ evidence_id: string; status: string }>(`${base}/evidence/${encodeURIComponent(evidenceId)}/process`, { method: 'POST', token }),
    removeEvidence: (evidenceId: string) => request<void>(`${base}/evidence/${encodeURIComponent(evidenceId)}`, { method: 'DELETE', token }),
    coverage: (signal?: AbortSignal) => request<Coverage>(`${base}/coverage`, { token, signal }),
    saveDraft: (body: Draft) => request<Coverage>(`${base}/draft`, { method: 'PATCH', token, body }),
    contest: (key: string, action: 'submit' | 'draft' = 'submit') => request<ContestResponse>(`${base}/contest`, { method: 'POST', token, body: { action }, idempotencyKey: key }),
  };
}
export type DisputeApi = ReturnType<typeof createDisputeApi>;
export const isAuthError = (error: unknown) => error instanceof ApiError && error.isAuth;
