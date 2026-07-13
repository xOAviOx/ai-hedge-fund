'use client';

import Link from 'next/link';

import { useQuote, useSparkline } from '@/lib/hooks';
import { money, num, pct, signClass, tickerLabel } from '@/lib/format';
import type { Position } from '@/lib/types';
import Sparkline from '@/components/charts/Sparkline';
import { Empty } from '@/components/ui';

function PositionRow({ p }: { p: Position }) {
  const { data: quote } = useQuote(p.ticker);
  const { data: ohlcv } = useSparkline(p.ticker);

  const price = quote?.price ?? null;
  const mktValue = price != null ? price * p.shares : null;
  const pnl = price != null ? (price - p.avg_cost) * p.shares : null;
  const pnlPct = price != null && p.avg_cost > 0 ? (price / p.avg_cost - 1) * 100 : null;
  const closes = (ohlcv?.bars ?? []).map((b) => b.close);

  return (
    <tr className="border-b border-line/60 last:border-0 hover:bg-white/[0.02]">
      <td className="py-2.5 pl-4 pr-2">
        <Link href={`/research/${encodeURIComponent(p.ticker)}`} className="group flex flex-col">
          <span className="text-[13px] font-medium text-ink group-hover:text-accent">{tickerLabel(p.ticker)}</span>
          <span className="text-2xs text-muted">{p.currency}</span>
        </Link>
      </td>
      <td className="tnum px-2 text-right text-[13px] text-ink">{num(p.shares, 0)}</td>
      <td className="tnum px-2 text-right text-[13px] text-muted">{money(p.avg_cost, p.currency)}</td>
      <td className="tnum px-2 text-right text-[13px] text-ink">{price != null ? money(price, p.currency) : '—'}</td>
      <td className="tnum px-2 text-right text-[13px] text-ink">{mktValue != null ? money(mktValue, p.currency) : '—'}</td>
      <td className={`tnum px-2 text-right text-[13px] ${signClass(pnl)}`}>
        {pnl != null ? money(pnl, p.currency) : '—'}
      </td>
      <td className={`tnum px-2 text-right text-[13px] ${signClass(pnlPct)}`}>{pct(pnlPct)}</td>
      <td className="py-2.5 pl-2 pr-4">
        <div className="flex justify-end">
          <Sparkline data={closes} />
        </div>
      </td>
    </tr>
  );
}

export default function PositionsTable({ positions }: { positions: Position[] }) {
  if (!positions.length) {
    return <Empty>No open positions yet. Run the fund to let the agents allocate.</Empty>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="label border-b border-line text-right">
            <th className="py-2 pl-4 pr-2 text-left font-medium">Ticker</th>
            <th className="px-2 font-medium">Shares</th>
            <th className="px-2 font-medium">Avg cost</th>
            <th className="px-2 font-medium">Last</th>
            <th className="px-2 font-medium">Mkt value</th>
            <th className="px-2 font-medium">P&amp;L</th>
            <th className="px-2 font-medium">P&amp;L %</th>
            <th className="py-2 pl-2 pr-4 font-medium">30d</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <PositionRow key={p.ticker} p={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
