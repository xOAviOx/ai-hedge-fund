'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Microscope,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { clsx } from 'clsx';

import { useAuth } from '@/context/AuthContext';

const NAV = [
  { label: 'Fund Console', href: '/', icon: LayoutDashboard, match: (p: string) => p === '/' },
  { label: 'Decision Room', href: '/decisions', icon: ScrollText, match: (p: string) => p.startsWith('/decisions') },
  { label: 'Research', href: '/research', icon: Microscope, match: (p: string) => p.startsWith('/research') },
  { label: 'Backtest Lab', href: '/backtest', icon: FlaskConical, match: (p: string) => p.startsWith('/backtest') },
  { label: 'Risk Desk', href: '/risk', icon: Activity, match: (p: string) => p.startsWith('/risk') },
  { label: 'Settings', href: '/settings', icon: SettingsIcon, match: (p: string) => p.startsWith('/settings') },
];

export default function Sidebar() {
  const pathname = usePathname() || '/';
  const { user, signOut } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-line bg-panel">
      <Link href="/" className="flex items-center gap-2.5 border-b border-line px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
          <ShieldCheck size={18} />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-ink">PortAI</div>
          <div className="text-2xs uppercase tracking-widest text-muted">Stratton Fund</div>
        </div>
      </Link>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map(({ label, href, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors',
                active ? 'bg-white/[0.06] font-medium text-ink' : 'text-muted hover:bg-white/[0.03] hover:text-ink',
              )}
            >
              <Icon size={16} className={active ? 'text-accent' : ''} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-3 py-3">
        {user ? (
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-accent">
                <UserIcon size={14} />
              </span>
              <span className="truncate text-2xs text-muted">{user.email ?? 'Signed in'}</span>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign out"
              className="text-muted transition-colors hover:text-down"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <Link
            href="/auth"
            className="flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-ink transition-colors hover:bg-white/5"
          >
            <UserIcon size={14} /> Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
