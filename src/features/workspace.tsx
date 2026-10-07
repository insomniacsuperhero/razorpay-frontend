import { createContext, useContext } from 'react';
import type { DisputeDetail } from '../api/types';
import type { DisputeApi } from '../api/workflow';
import type { MerchantApi } from '../api/merchant';

export interface Workspace {
  data: DisputeDetail;
  api: DisputeApi;
  /** Read-only data for the app's tabs (Razorpay test API via the backend). */
  merchant: MerchantApi;
  root: string;
  refreshing: boolean;
  preview?: boolean;
  onAuthError: () => void;
  /** Opens the Add proof bottom sheet (screen 2) from any screen. */
  openProofSheet: () => void;
  /** Marks the start of the 2-minute timer; safe to call more than once. */
  startTimer: () => void;
  refresh: () => Promise<unknown>;
}

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error('useWorkspace outside DisputeWorkspace');
  return v;
}

/** Path to a dispute screen: this workspace's root for its own dispute, otherwise that dispute's own workspace. */
export function disputePath(ws: Pick<Workspace, 'data' | 'root'>, id: string) {
  return id === ws.data.dispute.id ? ws.root : `/d/${encodeURIComponent(id)}`;
}
