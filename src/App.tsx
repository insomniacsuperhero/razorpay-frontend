import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BladeProvider } from '@razorpay/blade/components';
import { bladeTheme } from '@razorpay/blade/tokens';
import { ApiError } from './api/client';
import { createDisputeApi, type DisputeApi } from './api/workflow';
import { createMerchantApi, type MerchantApi } from './api/merchant';
import { clearSession, exchangeLink, readSession } from './auth/session';
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
import { UploadProvider } from './state/uploads';
import { PROCESSING } from './lib/format';
const Preview = import.meta.env.DEV ? lazy(() => import('./dev/Preview')) : null;

export function App({ initialLinkToken }: { initialLinkToken: string | null }) {
  return <BladeProvider themeTokens={bladeTheme} colorScheme="light"><div className="app">
        <ErrorBoundary><Routes>
      <Route path="/d/:disputeId/*" element={<DisputeEntry initialLinkToken={initialLinkToken}/>}/>
      {Preview && <Route path="/preview/*" element={<Suspense fallback={<State title="Opening preview" busy>Preparing sample data.</State>}><Preview/></Suspense>}/>}
      <Route path="*" element={<State title="Open your dispute alert" action={import.meta.env.DEV ? <Link to="/preview/home">Open the sample app →</Link> : undefined}>Use the secure link in your latest Razorpay dispute alert to review the payment and respond.</State>}/>
    </Routes></ErrorBoundary>
    
  </div></BladeProvider>;
}
function DisputeEntry({ initialLinkToken }: { initialLinkToken: string | null }) {
  const { disputeId = '' } = useParams();
  const [session, setSession] = useState<Session | null>(() => initialLinkToken ? null : readSession(disputeId));
  const [error, setError] = useState<Error | null>(null);
  const [exchanging, setExchanging] = useState(!!initialLinkToken);
  const [attempt, setAttempt] = useState(0);
  const usedLink = useRef(false);
  const client = useQueryClient();
  const expire = () => { clearSession(disputeId); clearSession('merchant'); client.removeQueries({ queryKey: ['dispute', disputeId] }); setSession(null); };
  useEffect(() => {
    let active = true; setError(null);
    if (!initialLinkToken || usedLink.current) { setSession(readSession(disputeId)); setExchanging(false); return; }
    setSession(null); setExchanging(true);
    exchangeLink(disputeId, initialLinkToken).then(result => { if (active) { usedLink.current = true; setSession(result); } }).catch(err => { if (active) setError(err); }).finally(() => { if (active) setExchanging(false); });
    return () => { active = false; };
  }, [disputeId, initialLinkToken, attempt]);
  useEffect(() => {
    if (!session) return;
    const timeout = setTimeout(expire, Math.max(0, Date.parse(session.expires_at) - Date.now()));
    return () => clearTimeout(timeout);
  }, [session, disputeId]);
  const api = useMemo(() => createDisputeApi(disputeId, session?.access_token || ''), [disputeId, session?.access_token]);
  const merchant = useMemo(() => createMerchantApi(session?.access_token || ''), [session?.access_token]);
  if (exchanging) return <State title="Opening your secure dispute" busy>Verifying your alert link. The service may take a moment to wake up.</State>;
  if (error) return <State title={error instanceof ApiError && error.isAuth ? 'This alert link is no longer valid' : 'We could not open this dispute'} onRetry={error instanceof ApiError && error.isAuth ? undefined : () => setAttempt(x => x + 1)}>{error.message}{error instanceof ApiError && error.isAuth && ' Open the latest dispute alert for a fresh secure link.'}</State>;
  if (!session) return <State title="Open the latest dispute alert">Your secure session is missing or has expired. Open a fresh alert link to continue.</State>;
  return <DisputeWorkspace key={disputeId} id={disputeId} api={api} merchant={merchant} root={`/d/${encodeURIComponent(disputeId)}`} expire={expire}/>;
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
    {preview && <div className="preview-banner">Sample data</div>}
    <Routes>
      <Route index element={<DisputeScreen/>}/>
      <Route path="home" element={<HomeTab/>}/>
      <Route path="payments" element={<PaymentsTab/>}/>
      <Route path="disputes" element={<DisputesTab/>}/>
      <Route path="payments/:paymentId" element={<PaymentDetail/>}/>
      <Route path="products" element={<ProductsTab/>}/>
      <Route path="support" element={<SupportTab/>}/>
      <Route path="account" element={<AccountTab/>}/>
      <Route path="notifications" element={<NotificationsScreen/>}/>
      <Route path="checking" element={<CheckingScreen/>}/>
      <Route path="review" element={<ReviewScreen/>}/>
      <Route path="summary" element={<SummaryScreen/>}/>
      <Route path="*" element={<State title="Page not found" action={<Link to={root}>Return to your dispute</Link>}/>}/>
    </Routes>
    <AddProofSheet isOpen={sheet} onDismiss={() => setSheet(false)}/>
    <PushBanner/>
  </UploadProvider></WorkspaceContext.Provider>;
}
