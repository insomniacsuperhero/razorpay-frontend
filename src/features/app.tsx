import { createContext, useContext } from 'react';
import type { MerchantApi } from '../api/merchant';

/** Session-level context for the whole app (tabs, alerts), independent of any dispute. */
export interface AppCtx {
  merchant: MerchantApi;
  /** Path prefix: '' for the real app, '/preview' for the sample-data app. */
  base: string;
  preview?: boolean;
  onAuthError: () => void;
}
export const AppContext = createContext<AppCtx | null>(null);
export function useApp() {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp outside AppContext');
  return v;
}
export const disputeHref = (base: string, id: string) => `${base}/d/${encodeURIComponent(id)}`;
