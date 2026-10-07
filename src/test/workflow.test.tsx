import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BladeProvider } from '@razorpay/blade/components';
import { bladeTheme } from '@razorpay/blade/tokens';
import { type ReactNode } from 'react';
import { fileMime, putFile, createDisputeApi, type DisputeApi } from '../api/workflow';
import { ApiError } from '../api/client';
import { detail, evidence, coverage } from './fixtures';

function mockApi(): DisputeApi {
  return { detail: vi.fn().mockResolvedValue(detail), accept: vi.fn(), startTimer: vi.fn().mockResolvedValue({ timer_started_at: new Date().toISOString() }), createUpload: vi.fn().mockResolvedValue({ upload_id: 'upload_test', put_url: 'https://storage.example/test', method: 'PUT', headers: { 'Content-Type': 'image/png' }, expires_in: 900 }), putFile: vi.fn().mockResolvedValue(undefined), completeUpload: vi.fn().mockResolvedValue({ evidence_id: evidence.id, status: 'queued' }), evidence: vi.fn().mockImplementation(() => Promise.resolve(structuredClone(evidence))), patchEvidence: vi.fn().mockResolvedValue(evidence), retryEvidence: vi.fn().mockResolvedValue({ evidence_id: evidence.id, status: 'queued' }), removeEvidence: vi.fn().mockResolvedValue(undefined), coverage: vi.fn().mockResolvedValue(coverage), saveDraft: vi.fn().mockResolvedValue(coverage), contest: vi.fn().mockResolvedValue({ dispute: { ...detail.dispute, status: 'under_review', can_contest: false }, documents: 1, seconds_to_submit: 52 }) };
}
function wrap(children: ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<BladeProvider themeTokens={bladeTheme} colorScheme="light"><QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider></BladeProvider>); }
const png = () => new File(['proof'], 'delivery.png', { type: 'image/png' });
beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
afterEach(() => vi.unstubAllGlobals());

describe('file transfer boundaries', () => {
  it('rejects HEIC, empty, mismatched and oversized files before requesting upload URLs', () => {
    expect(() => fileMime(new File(['x'], 'photo.heic', { type: 'image/heic' }))).toThrow('Convert this HEIC');
    expect(() => fileMime(new File([], 'empty.pdf', { type: 'application/pdf' }))).toThrow('empty');
    expect(() => fileMime(new File(['x'], 'image.png', { type: 'text/html' }))).toThrow('Choose a JPG');
    const big = png(); Object.defineProperty(big, 'size', { value: 100 * 1024 * 1024 + 1 }); expect(() => fileMime(big)).toThrow('100 MB');
    expect(fileMime(png())).toBe('image/png');
  });
  it('uploads directly with signed headers and no API bearer or cookies', async () => {
    const sent: Record<string, string> = {}; let credentials: boolean | undefined; let method: string | undefined;
    class Xhr {
      upload = {}; timeout = 0; withCredentials = true; status = 200; onload?: () => void;
      open(value: string) { method = value; }
      setRequestHeader(name: string, value: string) { sent[name] = value; }
      send() { credentials = this.withCredentials; this.onload?.(); }
      abort() {}
    }
    vi.stubGlobal('XMLHttpRequest', Xhr);
    await putFile({ upload_id: 'u', put_url: 'https://storage.example/signed', method: 'PUT', headers: { 'Content-Type': 'image/png' }, expires_in: 900 }, png(), () => {}, new AbortController().signal);
    expect(method).toBe('PUT'); expect(credentials).toBe(false); expect(sent).toEqual({ 'Content-Type': 'image/png' });
  });
  it('retains API auth for completion and sends only the approved contest action', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 }))); vi.stubGlobal('fetch', fetch);
    const api = createDisputeApi('disp_test', 'access-secret'); await api.completeUpload('u'); await api.contest('stable-key');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer access-secret');
    expect(fetch.mock.calls[1][1].body).toBe('{"action":"submit"}'); expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe('stable-key');
  });
});

