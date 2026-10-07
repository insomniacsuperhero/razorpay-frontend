import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, ClockIcon, Heading, IconButton, ArrowLeftIcon, Spinner, Text } from '@razorpay/blade/components';
import type { Verdict } from '../lib/format';
import { VERDICT_COLOR, VERDICT_LABEL } from '../lib/format';

/** Page frame: a slim header like Razorpay's dispute page, scrolling content, and an optional
 *  sticky footer that holds the screen's single primary action (spec: one primary per screen). */
export function Screen({ title, back, timer, step, children, footer }: {
  title: string; back?: string; timer?: string | null; step?: string; children: ReactNode; footer?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="screen">
      <header className="topbar">
        {back
          ? <IconButton icon={ArrowLeftIcon} accessibilityLabel="Back" size="large" onClick={() => navigate(back)} />
          : <span />}
        <div className="topbar-title">
          <Text size="large" weight="semibold">{title}</Text>
          {step && <Text size="xsmall" color="surface.text.gray.muted">{step}</Text>}
        </div>
        {timer ? <span className="timer" title="Time since you tapped Add proof"><ClockIcon size="small" color="surface.icon.gray.muted" />{timer}</span> : <span />}
      </header>
      <main className="content">{children}</main>
      {footer && <footer className="sticky-footer">{footer}</footer>}
    </div>
  );
}

export function Section({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {(title || aside) && <div className="section-head">{title && <Text size="small" weight="semibold" color="surface.text.gray.subtle">{title}</Text>}{aside}</div>}
      {children}
    </section>
  );
}

export function Panel({ children, tone, className = '' }: { children: ReactNode; tone?: 'flag' | 'muted' | 'success'; className?: string }) {
  return <div className={`panel ${tone ? `panel-${tone}` : ''} ${className}`}>{children}</div>;
}

export function KV({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <Text size="small" color="surface.text.gray.muted">{label}</Text>
      <span className={mono ? 'mono' : ''}><Text size="small" weight="medium">{value as string}</Text></span>
    </div>
  );
}

export function VerdictBadge({ verdict, size = 'medium' }: { verdict?: Verdict | null; size?: 'small' | 'medium' }) {
  if (!verdict) return null;
  return <Badge color={VERDICT_COLOR[verdict]} size={size} emphasis="subtle">{VERDICT_LABEL[verdict]}</Badge>;
}

export function State({ title, children, busy, onRetry, action }: {
  title: string; children?: ReactNode; busy?: boolean; onRetry?: () => void; action?: ReactNode;
}) {
  return (
    <div className="state">
      {busy && <Spinner accessibilityLabel="Loading" size="large" />}
      <Heading size="medium">{title}</Heading>
      {children && <Text color="surface.text.gray.subtle">{children as string}</Text>}
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
      {action}
    </div>
  );
}

export function FieldTag({ field }: { field?: string | null }) {
  if (!field || field === 'none') return null;
  return <span className="field-tag" title="Razorpay evidence field this fills">fills <code>{field}</code></span>;
}
