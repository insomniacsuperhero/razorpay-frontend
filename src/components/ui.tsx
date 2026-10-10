import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, ClockIcon, Heading, IconButton, ArrowLeftIcon, Skeleton, Text } from '@razorpay/blade/components';
import type { Verdict } from '../lib/format';
import { VERDICT_COLOR, VERDICT_LABEL } from '../lib/format';

/** Page frame: a slim header like Razorpay's dispute page, scrolling content, and an optional
 *  sticky footer that holds the screen's single primary action (spec: one primary per screen). */
export function Screen({ title, back, timer, step, children, footer }: {
  title: string; back?: string; timer?: string | null; step?: string; children: ReactNode; footer?: ReactNode;
}) {
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  // WCAG 2.4.2 + 2.4.3: each screen names the page and moves focus to its heading, so screen
  // reader and keyboard users land at the top of the new screen instead of a stale button.
  useEffect(() => {
    document.title = `${title} · Disputes · Razorpay`;
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <div className="screen">
      <header className="topbar">
        {back
          ? <IconButton icon={ArrowLeftIcon} accessibilityLabel="Back" size="large" onClick={() => navigate(back)} />
          : <span />}
        <div className="topbar-title">
          <h1 ref={heading} tabIndex={-1} className="h-reset screen-h1"><Text as="span" size="large" weight="semibold">{title}</Text></h1>
          {step && <Text size="xsmall" color="surface.text.gray.muted">{step}</Text>}
        </div>
        {timer
          ? <span className="timer" role="timer" aria-label={`Time since you tapped Add proof: ${timer}`}><ClockIcon size="small" color="surface.icon.gray.muted" /><span aria-hidden="true">{timer}</span></span>
          : <span />}
      </header>
      <main className="content" id="main">{children}</main>
      {footer && <footer className="sticky-footer">{footer}</footer>}
    </div>
  );
}

/** Text only screen readers hear (status words, context for icons). */
export function SrOnly({ children, ...rest }: { children?: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return <span className="sr-only" {...rest}>{children}</span>;
}

/** True once a wait has gone on for `ms`; used to swap a generic message for a more helpful one. */
export function useSlow(ms: number) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), ms); return () => clearTimeout(t); }, [ms]);
  return slow;
}

/** Placeholder shaped like the content that is coming, instead of a spinner. */
export function SkeletonBlock({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="skeleton-block" role="status" aria-live="polite" aria-busy="true">
      <SrOnly>{label}</SrOnly>
      <div aria-hidden="true" className="skeleton-lines">
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === 0 ? '55%' : i % 2 ? '90%' : '75%'} height={i === 0 ? '18px' : '12px'} borderRadius="medium" />)}
      </div>
    </div>
  );
}

export function Section({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {(title || aside) && <div className="section-head">{title && <h2 className="h-reset"><Text as="span" size="small" weight="semibold" color="surface.text.gray.subtle">{title}</Text></h2>}{aside}</div>}
      {children}
    </section>
  );
}

export function Panel({ children, tone, className = '', id }: { children: ReactNode; tone?: 'flag' | 'muted' | 'success'; className?: string; id?: string }) {
  return <div id={id} className={`panel ${tone ? `panel-${tone}` : ''} ${className}`}>{children}</div>;
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

export function State({ title, children, busy, onRetry, action, slowText }: {
  title: string; children?: ReactNode; busy?: boolean; onRetry?: () => void; action?: ReactNode;
  /** Shown instead of `children` once the wait passes 6 s, so nobody stares at the same line. */
  slowText?: string;
}) {
  const slow = useSlow(6000);
  return (
    <div className="state" role={busy ? 'status' : onRetry ? 'alert' : undefined} aria-live={busy ? 'polite' : undefined} aria-busy={busy || undefined}>
      {busy && (
        <div className="state-skeleton" aria-hidden="true">
          <Skeleton width="64px" height="64px" borderRadius="round" />
          <Skeleton width="70%" height="14px" borderRadius="medium" />
          <Skeleton width="50%" height="12px" borderRadius="medium" />
        </div>
      )}
      <Heading size="medium">{title}</Heading>
      {(busy && slow && slowText) ? <Text color="surface.text.gray.subtle">{slowText}</Text>
        : children && <Text color="surface.text.gray.subtle">{children as string}</Text>}
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
      {action}
    </div>
  );
}

export function FieldTag({ field }: { field?: string | null }) {
  if (!field || field === 'none') return null;
  return <span className="field-tag" title="Razorpay evidence field this fills">fills <code>{field}</code></span>;
}
