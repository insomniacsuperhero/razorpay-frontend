import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CloseIcon, IconButton, Text } from '@razorpay/blade/components';
import { SrOnly } from '../components/ui';
import { disputeHref, useApp } from './app';

const SEEN = 'proof-bridge:push-seen';
const seen = (): number[] => { try { return JSON.parse(sessionStorage.getItem(SEEN) || '[]'); } catch { return []; } };
const markSeen = (id: number) => { try { sessionStorage.setItem(SEEN, JSON.stringify([...seen(), id])); } catch { /* storage blocked */ } };

/** In-app push: the newest unread in-app alert slides in at the top of whatever screen is open. */
export function PushBanner() {
  const ws = useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const q = useQuery({ queryKey: ['merchant', 'notifications'], queryFn: ({ signal }) => ws.merchant.notifications(signal), refetchInterval: 15_000 });
  const [hidden, setHidden] = useState<number | null>(null);
  const [held, setHeld] = useState(false);   // pause auto-hide while the seller is hovering or focused on it
  const next = q.data?.items.find(n => n.channel === 'in_app' && !n.read && !seen().includes(n.id));
  useEffect(() => {
    if (!next || held) return;
    const t = setTimeout(() => { markSeen(next.id); setHidden(next.id); }, 10000);
    return () => clearTimeout(t);
  }, [next?.id, held]);
  const showing = next && hidden !== next.id ? next : null;
  // The live region is always mounted so the alert is announced when it arrives.
  const live = <SrOnly role="status" aria-live="polite">{showing ? `New alert: ${showing.title}. ${showing.body}` : ''}</SrOnly>;
  if (!showing) return live;
  function open() {
    markSeen(next!.id); setHidden(next!.id);
    void ws.merchant.markRead().then(() => client.invalidateQueries({ queryKey: ['merchant', 'notifications'] })).catch(() => undefined);
    navigate(disputeHref(ws.base, next!.dispute_id));
  }
  return (
    <>{live}<div className="push-wrap" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
    <button className="push" onClick={open}>
      <span className="push-icon"><AlertTriangleIcon size="medium" color="feedback.icon.notice.intense" /></span>
      <span className="push-text">
        <Text size="xsmall" color="surface.text.gray.muted">Razorpay · now</Text>
        <Text size="small" weight="semibold">{showing.title}</Text>
        <Text size="xsmall" color="surface.text.gray.subtle" truncateAfterLines={2}>{showing.body}</Text>
      </span>
    </button>
    <IconButton icon={CloseIcon} size="medium" accessibilityLabel="Dismiss alert" onClick={() => { markSeen(showing.id); setHidden(showing.id); document.querySelector<HTMLElement>('.screen-h1, main h1')?.focus(); }} />
    </div></>
  );
}
