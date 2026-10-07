import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, Text } from '@razorpay/blade/components';
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
  const next = q.data?.items.find(n => n.channel === 'in_app' && !n.read && !seen().includes(n.id));
  useEffect(() => {
    if (!next) return;
    const t = setTimeout(() => { markSeen(next.id); setHidden(next.id); }, 8000);
    return () => clearTimeout(t);
  }, [next?.id]);
  if (!next || hidden === next.id) return null;
  function open() {
    markSeen(next!.id); setHidden(next!.id);
    void ws.merchant.markRead().then(() => client.invalidateQueries({ queryKey: ['merchant', 'notifications'] })).catch(() => undefined);
    navigate(disputeHref(ws.base, next!.dispute_id));
  }
  return (
    <button className="push" onClick={open} aria-live="polite">
      <span className="push-icon"><AlertTriangleIcon size="medium" color="feedback.icon.notice.intense" /></span>
      <span className="push-text">
        <Text size="xsmall" color="surface.text.gray.muted">Razorpay · now</Text>
        <Text size="small" weight="semibold">{next.title}</Text>
        <Text size="xsmall" color="surface.text.gray.subtle" truncateAfterLines={2}>{next.body}</Text>
      </span>
    </button>
  );
}
