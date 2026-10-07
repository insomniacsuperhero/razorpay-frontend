import { useEffect, useState } from 'react';
import { BellIcon, Button, CheckCircleIcon, ShareIcon, Text } from '@razorpay/blade/components';
import { disablePush, enablePush, isIOS, pushState, type PushState } from '../lib/push';
import { useWorkspace } from './workspace';

function usePush() {
  const { merchant, preview } = useWorkspace();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void pushState().then(async s => {
      if (!live) return;
      setState(s);
      // keep the server's copy in sync (e.g. after the database was reset)
      if (s === 'on' && !preview) {
        const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
        if (sub) await merchant.pushSubscribe(sub.toJSON()).catch(() => undefined);
      }
    }).catch(() => live && setState('unsupported'));
    return () => { live = false; };
  }, [merchant, preview]);
  async function run(fn: () => Promise<PushState>) {
    setBusy(true); setError(null);
    try { setState(await fn()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not change notifications.'); } finally { setBusy(false); }
  }
  return { state, busy, error, enable: () => run(() => enablePush(merchant)), disable: () => run(() => disablePush(merchant)) };
}

const COPY: Record<PushState, string> = {
  on: 'This phone gets an alert the moment a dispute is raised.',
  off: 'Get an alert on this phone the moment a dispute is raised.',
  blocked: 'Notifications are blocked for this app. Turn them on in your phone settings.',
  'needs-install': 'On iPhone, add this app to your Home Screen first: tap Share, then Add to Home Screen. Then open it from there.',
  unsupported: "This browser can't show notifications. Use Chrome on Android, or add the app to your iPhone's Home Screen.",
  'not-configured': 'Phone notifications are not set up on the server yet (VAPID keys).',
};

/** Row on Account → Notification. */
export function PhoneNotificationsRow() {
  const { state, busy, error, enable, disable } = usePush();
  return (
    <div className="setting push-row">
      {state === 'on' ? <CheckCircleIcon size="large" color="feedback.icon.positive.intense" /> : <BellIcon size="large" color="surface.icon.gray.normal" />}
      <div>
        <Text weight="semibold">Phone notifications</Text>
        <Text size="small" color="surface.text.gray.muted">{state ? COPY[state] : 'Checking…'}</Text>
        {error && <Text size="small" color="feedback.text.negative.intense">{error}</Text>}
      </div>
      {state === 'off' && <Button size="small" isLoading={busy} onClick={() => void enable()}>Turn on</Button>}
      {state === 'on' && <Button size="small" variant="tertiary" isLoading={busy} onClick={() => void disable()}>Turn off</Button>}
    </div>
  );
}

const DISMISSED = 'proof-bridge:push-prompt-dismissed';

/** One-time card on Home asking to turn on phone notifications (or how to install on iPhone). */
export function PushPrompt() {
  const { state, busy, error, enable } = usePush();
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; } });
  if (dismissed || !state || !(state === 'off' || (state === 'needs-install' && isIOS()))) return null;
  const close = () => { setDismissed(true); try { localStorage.setItem(DISMISSED, '1'); } catch { /* storage blocked */ } };
  return (
    <div className="card push-prompt">
      <div className="row-head">
        <span className="push-prompt-icon">{state === 'needs-install' ? <ShareIcon size="medium" color="surface.icon.primary.normal" /> : <BellIcon size="medium" color="surface.icon.primary.normal" />}</span>
        <div className="push-prompt-text">
          <Text weight="semibold">{state === 'needs-install' ? 'Add to Home Screen for alerts' : 'Turn on dispute alerts'}</Text>
          <Text size="small" color="surface.text.gray.subtle">{COPY[state]}</Text>
          {error && <Text size="small" color="feedback.text.negative.intense">{error}</Text>}
        </div>
      </div>
      <div className="row-actions">
        {state === 'off' && <Button size="small" isLoading={busy} onClick={() => void enable()}>Turn on</Button>}
        <Button size="small" variant="tertiary" onClick={close}>Not now</Button>
      </div>
    </div>
  );
}
