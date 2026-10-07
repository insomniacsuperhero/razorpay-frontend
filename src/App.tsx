import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BladeProvider } from '@razorpay/blade/components';
import { bladeTheme } from '@razorpay/blade/tokens';
import { ApiError } from './api/client';
import { createDisputeApi, type DisputeApi } from './api/workflow';
import { createMerchantApi, type MerchantApi } from './api/merchant';
import { clearSession, exchangeLink, openSession, readSession } from './auth/session';
import type { Session } from './api/types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { State } from './components/ui';
import { DisputeScreen } from './features/DisputeScreen';
import { CheckingScreen } from './features/CheckingScreen';
import { ReviewScreen } from './features/ReviewScreen';
import { SummaryScreen } from './features/SummaryScreen';
import { AddProofSheet } from './features/AddProofSheet';
import { PushBanner } from './features/PushBanner';
import { AccountTab, DisputesTab, NotificationsScreen, HomeTab, PaymentDetail, PaymentsTab, ProductsTab, SupportTab } from './features/AppTabs';
import { WorkspaceContext } from './features/workspace';
import { AppContext, disputeHref, useApp } from './features/app';
import { UploadProvider } from './state/uploads';
import { PROCESSING } from './lib/format';
// Sample-data app: always in dev; in production only when VITE_ENABLE_PREVIEW=true (it never touches real data)
const PREVIEW_ON = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PREVIEW === 'true';
const Preview = PREVIEW_ON ? lazy(() => import('./dev/Preview')) : null;

function SignedOut() {
  return <State title="Open your dispute alert" action={PREVIEW_ON ? <Link to="/preview/home">Explore the app with sample data →</Link> : undefined}>Use the secure link in your latest Razorpay dispute alert, WhatsApp message or email to sign in. After that, this app opens straight to your account.</State>;
}

export function App({ initialLinkToken }: { initialLinkToken: string | null }) {
  return <BladeProvider themeTokens={bladeTheme} colorScheme="light"><div className="app">
    <ErrorBoundary><Routes>
      {Preview && <Route path="/preview/*" element={<Suspense fallback={<State title="Opening preview" busy>Preparing sample data.</State>}><Preview/></Suspense>}/>}
      <Route path="/*" element={<SessionGate initialLinkToken={initialLinkToken}/>}/>
    </Routes></ErrorBoundary>
  </div></BladeProvider>;
}

/** Signs the app in, in this order: the single-use link from an alert, the saved session, then
 *  (when the server allows it, DEMO_OPEN_ACCESS) an open demo session, so the app opens straight to Home. */
function SessionGate({ initialLinkToken }: { initialLinkToken: string | null }) {
  const location = useLocation();
  const client = useQueryClient();
  const linkDispute = initialLinkToken ? decodeURIComponent(location.pathname.match(/^\/d\/([^/]+)/)?.[1] || '') : '';
  const [session, setSession] = useState<Session | null>(() => (initialLinkToken ? null : readSession('merchant')));
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(!session);
  const [attempt, setAttempt] = useState(0);
  const usedLink = useRef(false);
  useEffect(() => {
    if (session) return;
    let live = true; setBusy(true); setError(null);
    const p = initialLinkToken && linkDispute && !usedLink.current
      ? exchangeLink(linkDispute, initialLinkToken).then(r => { usedLink.current = true; return r; })
      : (readSession('merchant') ? Promise.resolve(readSession('merchant')!) : openSession());
    p.then(r => { if (live) setSession(r); }).catch(e => { if (live) setError(e); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [session, attempt]);
  const expire = useCallback(() => { clearSession('merchant'); if (session?.dispute_id) clearSession(session.dispute_id); client.clear(); setSession(null); }, [session, client]);
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(expire, Math.max(0, Date.parse(session.expires_at) - Date.now()));
    return () => clearTimeout(t);
  }, [session, expire]);
  const merchant = useMemo(() => createMerchantApi(session?.access_token || ''), [session?.access_token]);
  if (busy) return <State title="Opening your account" busy>Connecting to Razorpay. The service may take a moment to wake up.</State>;
  if (error) {
    const auth = error instanceof ApiError && error.isAuth;
    if (auth && !initialLinkToken) return <SignedOut/>;
    return <State title={auth ? 'This alert link is no longer valid' : 'We could not open the app'} onRetry={() => setAttempt(x => x + 1)}>{error.message}</State>;
  }
  if (!session) return <SignedOut/>;
  return <AppContext.Provider value={{ merchant, base: '', onAuthError: expire }}>
    <AppRoutes token={session.access_token} expire={expire}/>
  </AppContext.Provider>;
}

/** The app's routes: the tabs at the top level, every dispute's flow under /d/:id. Shared by the real and sample apps. */
export function AppRoutes({ token, expire, makeApi, preview }: { token?: string; expire: () => void; makeApi?: (id: string) => DisputeApi; preview?: boolean }) {
  return <>
    {preview && <div className="preview-banner">Sample data</div>}
    <Routes>
      <Route index element={<Navigate to="home" replace/>}/>
      <Route path="home" element={<HomeTab/>}/>
      <Route path="payments" element={<PaymentsTab/>}/>
      <Route path="payments/:paymentId" element={<PaymentDetail/>}/>
      <Route path="disputes" element={<DisputesTab/>}/>
      <Route path="products" element={<ProductsTab/>}/>
      <Route path="support" element={<SupportTab/>}/>
      <Route path="account" element={<AccountTab/>}/>
      <Route path="notifications" element={<NotificationsScreen/>}/>
      <Route path="d/:disputeId/*" element={<DisputeRoute token={token} expire={expire} makeApi={makeApi} preview={preview}/>}/>
      <Route path="*" element={<Navigate to="home" replace/>}/>
    </Routes>
    <PushBanner/>
  </>;
}

function DisputeRoute({ token, expire, makeApi, preview }: { token?: string; expire: () => void; makeApi?: (id: string) => DisputeApi; preview?: boolean }) {
  const { disputeId = '' } = useParams();
  const { base, merchant } = useApp();
  const api = useMemo(() => (makeApi ? makeApi(disputeId) : createDisputeApi(disputeId, token || '')), [disputeId, token, makeApi]);
  return <DisputeWorkspace key={disputeId} id={disputeId} api={api} merchant={merchant} root={disputeHref(base, disputeId)} expire={expire} preview={preview}/>;
}

export interface WorkspaceProps { id: string; api: DisputeApi; merchant: MerchantApi; root: string; expire: () => void; preview?: boolean }
export function DisputeWorkspace({ id, api, merchant, root, expire, preview }: WorkspaceProps) {
  const query = useQuery({
    queryKey: ['dispute', id, 'detail'], queryFn: ({ signal }) => api.detail(signal), refetchOnWindowFocus: true,
    // poll quickly while a file is still being read, otherwise every 30 s
    refetchInterval: q => (q.state.data?.evidence.some(e => !e.removed && PROCESSING.has(e.status)) ? 2500 : 30000),
  });
  const client = useQueryClient();
  const [sheet, setSheet] = useState(false);
  const timerStarted = useRef(false);
  useEffect(() => { if (query.error instanceof ApiError && query.error.isAuth) expire(); }, [query.error, expire]);
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ['dispute', id] }), [client, id]);
  const startTimer = useCallback(() => {
    if (timerStarted.current) return;
    timerStarted.current = true;
    api.startTimer().then(refresh).catch(() => { timerStarted.current = false; });
  }, [api, refresh]);
  if (query.isPending) return <State title="Getting the latest dispute" busy>Checking the dispute and its payment details securely.</State>;
  if (query.isError) return <State title={query.error instanceof ApiError && query.error.status === 404 ? 'Dispute not found' : 'Could not load the dispute'} onRetry={() => { void query.refetch(); }}>{query.error.message}</State>;
  const ws = { data: query.data, api, merchant, root, refreshing: query.isFetching, preview, onAuthError: expire, openProofSheet: () => setSheet(true), startTimer, refresh };
  return <WorkspaceContext.Provider value={ws}><UploadProvider api={api} onAuthError={expire}>
    <Routes>
      <Route index element={<DisputeScreen/>}/>
      <Route path="checking" element={<CheckingScreen/>}/>
      <Route path="review" element={<ReviewScreen/>}/>
      <Route path="summary" element={<SummaryScreen/>}/>
      <Route path="*" element={<Navigate to={root} replace/>}/>
    </Routes>
    <AddProofSheet isOpen={sheet} onDismiss={() => setSheet(false)}/>
  </UploadProvider></WorkspaceContext.Provider>;
}
