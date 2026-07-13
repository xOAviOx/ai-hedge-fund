// Shared UI primitives — the small, reused terminal building blocks.
import React from 'react';
import { clsx } from 'clsx';

import type { Direction, OrderAction } from '@/lib/types';

export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('panel flex flex-col', className)}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="label">{title}</h2>
          {right}
        </header>
      )}
      <div className={clsx('flex-1', bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className={clsx('tnum text-xl font-semibold text-ink', valueClass)}>{value}</span>
      {sub != null && <span className="tnum text-2xs text-muted">{sub}</span>}
    </div>
  );
}

const DIR_STYLE: Record<Direction, string> = {
  bullish: 'bg-up/10 text-up border-up/25',
  bearish: 'bg-down/10 text-down border-down/25',
  neutral: 'bg-white/5 text-muted border-line',
};

export function DirectionPill({ direction, className }: { direction: Direction; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide',
        DIR_STYLE[direction] ?? DIR_STYLE.neutral,
        className,
      )}
    >
      {direction}
    </span>
  );
}

const ACTION_STYLE: Record<OrderAction, string> = {
  buy: 'bg-up/10 text-up border-up/25',
  sell: 'bg-down/10 text-down border-down/25',
  hold: 'bg-white/5 text-muted border-line',
};

export function ActionPill({ action }: { action: OrderAction }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide',
        ACTION_STYLE[action] ?? ACTION_STYLE.hold,
      )}
    >
      {action}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  // confidence is 0–100 (see engine build_signal / analysts).
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-accent" style={{ width: `${v}%` }} />
      </div>
      <span className="tnum text-2xs text-muted">{Math.round(v)}</span>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-white/15 border-t-accent',
        className ?? 'h-4 w-4',
      )}
    />
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Spinner /> {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="max-w-md text-sm text-down">{msg}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded border border-line px-3 py-1.5 text-xs text-ink transition-colors hover:bg-white/5"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('shimmer rounded bg-white/5', className)} />;
}

export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' | 'muted' }) {
  const tones = {
    default: 'border-line bg-white/5 text-ink',
    accent: 'border-accent/30 bg-accent/10 text-accent',
    muted: 'border-line bg-transparent text-muted',
  };
  return (
    <span className={clsx('inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}
