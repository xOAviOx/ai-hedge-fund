'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

import type { DecisionSignal, Direction, OrderLite } from '@/lib/types';
import { displayForAgent, isPersona } from '@/lib/personas';
import { num, tickerLabel } from '@/lib/format';
import { ActionPill, ConfidenceBar, DirectionPill } from '@/components/ui';

function consensus(signals: DecisionSignal[]): { direction: Direction; bull: number; bear: number; neutral: number } {
  let bull = 0;
  let bear = 0;
  let neutral = 0;
  for (const s of signals) {
    if (s.direction === 'bullish') bull += 1;
    else if (s.direction === 'bearish') bear += 1;
    else neutral += 1;
  }
  const direction: Direction = bull > bear && bull >= neutral ? 'bullish' : bear > bull && bear >= neutral ? 'bearish' : 'neutral';
  return { direction, bull, bear, neutral };
}

function AgentRows({ signals }: { signals: DecisionSignal[] }) {
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  return (
    <table className="w-full">
      <tbody>
        {sorted.map((s) => (
          <tr key={s.agent} className="border-b border-line/50 last:border-0">
            <td className="w-40 py-2 pr-3 align-top">
              <span className="text-[13px] text-ink">{displayForAgent(s.agent)}</span>
            </td>
            <td className="w-24 py-2 pr-3 align-top">
              <DirectionPill direction={s.direction} />
            </td>
            <td className="w-28 py-2 pr-3 align-top">
              <ConfidenceBar value={s.confidence} />
            </td>
            <td className="py-2 align-top text-2xs leading-relaxed text-muted">{s.factors || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TickerDebate({
  ticker,
  signals,
  order,
  defaultOpen = false,
}: {
  ticker: string;
  signals: DecisionSignal[];
  order?: OrderLite;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const c = consensus(signals);
  const personas = signals.filter((s) => isPersona(s.agent));
  const analysts = signals.filter((s) => !isPersona(s.agent));

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <ChevronDown size={16} className={clsx('text-muted transition-transform', open ? '' : '-rotate-90')} />
          <span className="text-sm font-medium text-ink">{tickerLabel(ticker)}</span>
          <DirectionPill direction={c.direction} />
        </div>
        <div className="flex items-center gap-4">
          <div className="tnum flex items-center gap-2 text-2xs">
            <span className="text-up">{c.bull}▲</span>
            <span className="text-down">{c.bear}▼</span>
            <span className="text-muted">{c.neutral}•</span>
          </div>
          {order && order.action !== 'hold' ? (
            <span className="flex items-center gap-1.5">
              <ActionPill action={order.action} />
              <span className="tnum text-2xs text-muted">{num(order.quantity, 0)}</span>
            </span>
          ) : (
            <ActionPill action="hold" />
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {personas.length > 0 && (
            <div>
              <div className="label mb-1">Investor personas</div>
              <AgentRows signals={personas} />
            </div>
          )}
          {analysts.length > 0 && (
            <div>
              <div className="label mb-1">Analyst models</div>
              <AgentRows signals={analysts} />
            </div>
          )}
          {order && (
            <div className="rounded-md border border-line bg-panel2 px-3 py-2">
              <div className="label mb-1">Portfolio manager</div>
              <div className="flex items-center gap-2 text-xs text-ink">
                <ActionPill action={order.action} />
                <span className="tnum">
                  {num(order.quantity, 0)} @ {num(order.price, 2)}
                </span>
                <span className="text-muted">— {order.reasoning || 'no rationale recorded'}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
