'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { useRun } from '@/lib/hooks';
import { dateTime, money, num, tickerLabel } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { ActionPill, Empty, ErrorState, Loading, Panel, Stat } from '@/components/ui';
import TickerDebate from '@/components/decisions/TickerDebate';
import type { OrderLite } from '@/lib/types';

function MemoLetter({ memo }: { memo: string }) {
  const paras = memo.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="rounded-lg border border-line bg-panel2 p-6">
      <div className="mx-auto max-w-2xl space-y-3 font-sans text-sm leading-relaxed text-ink/90">
        {paras.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function RunDetailPage({ params }: { params: { runId: string } }) {
  const run = useRun(params.runId);

  const back = (
    <Link
      href="/decisions"
      className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-ink"
    >
      <ArrowLeft size={14} /> All runs
    </Link>
  );

  if (run.isLoading) {
    return (
      <div>
        <PageHeader title="Run detail" subtitle="Decision Room" actions={back} />
        <Loading label="Loading run" />
      </div>
    );
  }
  if (run.isError || !run.data) {
    return (
      <div>
        <PageHeader title="Run detail" subtitle="Decision Room" actions={back} />
        <ErrorState error={run.error} onRetry={() => run.refetch()} />
      </div>
    );
  }

  const r = run.data;
  const orderByTicker = new Map<string, OrderLite>(r.orders.map((o) => [o.ticker, o]));
  const tickers = Object.keys(r.signals_by_ticker);
  const executed = r.orders.filter((o) => o.action !== 'hold');

  return (
    <div>
      <PageHeader title={`Run ${r.run_id.slice(0, 8)}`} subtitle={dateTime(r.ts)} actions={back} />

      <div className="space-y-4 p-6">
        <div className="panel grid grid-cols-2 gap-6 p-5 md:grid-cols-4">
          <Stat label="Tickers analysed" value={<span className="tnum">{r.universe.length}</span>} />
          <Stat label="Orders placed" value={<span className="tnum">{executed.length}</span>} />
          <Stat label="Latency" value={<span className="tnum">{num(r.latency_ms / 1000, 2)}s</span>} />
          <Stat label="LLM cost" value={<span className="tnum">{money(r.llm_cost, 'USD', 4)}</span>} />
        </div>

        <Panel title="Fund memo" bodyClassName="p-4">
          {r.memo ? (
            <MemoLetter memo={r.memo} />
          ) : (
            <div className="rounded-md border border-line bg-panel2 px-4 py-3 text-xs text-muted">
              No memo for this run — no LLM key was configured. The deterministic pipeline still ran; every signal and
              order below is real.
            </div>
          )}
        </Panel>

        <div>
          <div className="label mb-2 px-1">Agent debate — {tickers.length} tickers</div>
          {tickers.length === 0 ? (
            <Empty>No signals recorded for this run.</Empty>
          ) : (
            <div className="space-y-2">
              {tickers.map((t, i) => (
                <TickerDebate
                  key={t}
                  ticker={t}
                  signals={r.signals_by_ticker[t]}
                  order={orderByTicker.get(t)}
                  defaultOpen={i === 0}
                />
              ))}
            </div>
          )}
        </div>

        <Panel title={`Executed orders (${executed.length})`} bodyClassName="p-0">
          {executed.length === 0 ? (
            <Empty>No trades — the risk-adjusted consensus held every position.</Empty>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="label border-b border-line text-right">
                  <th className="py-2 pl-4 text-left font-medium">Ticker</th>
                  <th className="px-2 font-medium">Action</th>
                  <th className="px-2 font-medium">Qty</th>
                  <th className="px-2 font-medium">Price</th>
                  <th className="py-2 pl-2 pr-4 text-left font-medium">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {executed.map((o, i) => (
                  <tr key={`${o.ticker}-${i}`} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5 pl-4 text-[13px] text-ink">{tickerLabel(o.ticker)}</td>
                    <td className="px-2 text-right">
                      <ActionPill action={o.action} />
                    </td>
                    <td className="tnum px-2 text-right text-[13px] text-ink">{num(o.quantity, 0)}</td>
                    <td className="tnum px-2 text-right text-[13px] text-ink">{num(o.price, 2)}</td>
                    <td className="py-2.5 pl-2 pr-4 text-2xs text-muted">{o.reasoning || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
