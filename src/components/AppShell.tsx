import type { ComponentType, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertOctagonIcon, GridIcon, HelpCircleIcon, HomeIcon, TransactionsIcon, UserIcon } from '@razorpay/blade/components';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../features/app';
import { Text } from '@razorpay/blade/components';

/** The Razorpay merchant app frame: a page header and the five bottom tabs.
 *  The dispute flow screens are pushed on top of this frame (no tab bar), like any detail screen in the app. */
export function TabPage({ root, title, header, children, flush }: { root: string; title?: string; header?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <div className="tab-page">
      {header ?? (title && <header className="page-header"><Text size="large" weight="semibold"><span className="page-title">{title}</span></Text></header>)}
      <main className={`tab-content ${flush ? 'flush' : ''}`}>{children}</main>
      <TabBar root={root} />
    </div>
  );
}

type IconT = ComponentType<{ size?: 'large' | 'xlarge'; color?: 'surface.icon.primary.normal' | 'surface.icon.gray.normal' }>;
const TABS: { to: string; label: string; icon: IconT }[] = [
  { to: 'home', label: 'Home', icon: HomeIcon as IconT },
  { to: 'payments', label: 'Payments', icon: TransactionsIcon as IconT },
  { to: 'disputes', label: 'Disputes', icon: AlertOctagonIcon as IconT },
  { to: 'products', label: 'Products', icon: GridIcon as IconT },
  { to: 'support', label: 'Support', icon: HelpCircleIcon as IconT },
  { to: 'account', label: 'Account', icon: UserIcon as IconT },
];

function TabBar({ root }: { root: string }) {
  const { merchant } = useApp();
  const list = useQuery({ queryKey: ['merchant', 'disputes'], queryFn: ({ signal }) => merchant.disputes(signal), refetchInterval: 20_000, staleTime: 10_000 });
  // disputes waiting for a response, across the account (falls back to this one while loading)
  const pending = list.data ? list.data.items.filter(d => d.status === 'open').length : 0;
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(t => (
        <NavLink key={t.to} to={`${root}/${t.to}`} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          {({ isActive }) => <>
            <span className="tab-icon"><t.icon size="large" color={isActive ? 'surface.icon.primary.normal' : 'surface.icon.gray.normal'} />{t.to === 'disputes' && pending > 0 && <span className="tab-badge"><span aria-hidden="true">{pending}</span><span className="sr-only">, {pending} need{pending === 1 ? 's' : ''} a response</span></span>}</span>
            <span>{t.label}</span>
          </>}
        </NavLink>
      ))}
    </nav>
  );
}

export const MERCHANT_NAME = (import.meta.env.VITE_MERCHANT_NAME as string | undefined) || 'Your business';
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || 'RZ';
