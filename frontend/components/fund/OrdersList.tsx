'use client';

import Link from 'next/link';

import { money, num, relativeTime, tickerLabel } from '@/lib/format';
import type { Order } from '@/lib/types';
import { ActionPill, Empty } from '@/components/ui';

export default function OrdersList({ orders }: { orders: Order[] }) {
  if (!orders.length) return <Empty>No orders recorded yet.</Empty>;
  return (
    <ul className="divide-y divide-line/60">
      {orders.map((o) => (
        <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <ActionPill action={o.action} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">{tickerLabel(o.ticker)}</div>
              <div className="truncate text-2xs text-muted">{o.reasoning || '—'}</div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-[13px] text-ink">
              {num(o.quantity, 0)} @ {money(o.price, null, 2)}
            </div>
            <div className="text-2xs text-muted">
              {o.run_id ? (
                <Link href={`/decisions/${o.run_id}`} className="hover:text-accent">
                  {relativeTime(o.ts)}
                </Link>
              ) : (
                relativeTime(o.ts)
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
