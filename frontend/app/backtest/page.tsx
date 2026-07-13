'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info, Play } from 'lucide-react';

import { useBacktest, useFund, useStartBacktest } from '@/lib/hooks';
import { dateOnly, num, pct, signClass, tickerLabel } from '@/lib/format';
import type { BacktestRequest } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { ActionPill, Empty, ErrorState, Panel, Spinner, Stat } from '@/components/ui';
import EquityChart from '@/components/charts/EquityChart';

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export default function BacktestPage() {
  const fund = useFund();
  const start = useStartBacktest();
  const [activeId, setActiveId] = useState<string | null>(null);
  const bt = useBacktest(activeId);

  const [universe, setUniverse] = useState('');
  const [from, setFrom] = useState(isoDaysAgo(365));
  const [to, setTo] = useState(today());
  const [cash, setCash] = useState('1000000');
  const [step, setStep] = useState('7');

  useEffect(() => {
    if (fund.data && !universe) {
      // default to the first 6 names for a quick, representative run
      setUniverse(fund.data.universe.slice(0, 6).join(', '));
      setCash(String(fund.data.starting_cash));
    }
  }, [fund.data, universe]);

  const parsedUniverse = useMemo(
    () => universe.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
    [universe],
  );

  const run = () => {
    const body: BacktestRequest = {
      universe: parsedUniverse,
      start: from,
      end: to,
      initial_cash: Number(cash) || undefined,
      step_days: Number(step) || 7,
    };
    start.mutate(body, { onSuccess: (res) => setActiveId(res.backtest_id) });
  };

  const data = bt.data;
  const running = data?.status === 'running' || start.isPending;

  const inputClass =
    'w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none';

  return (
    <div>
      <PageHeader
        title="Backtest Lab"
        subtitle="Replay the agent pipeline weekly over a historical window with point-in-time data."
        actions={
          <button
            onClick={run}
            disabled={running || parsedUniverse.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Spinner className="h-3.5 w-3.5" /> : <Play size={14} />}
            {running ? 'Running…' : 'Run backtest'}
          </button>
        }
      />

      <div className="space-y-4 p-6">
        <Panel title="Configuration" bodyClassName="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label mb-1.5 block">Universe</label>
              <textarea
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
                rows={2}
                className={`${inputClass} tnum resize-y`}
                placeholder="RELIANCE.NS, TCS.NS, AAPL"
              />
              <p className="mt-1 text-2xs text-muted">{parsedUniverse.length} tickers</p>
            </div>
            <div>
              <label className="label mb-1.5 block">Start</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} tnum`} />
            </div>
            <div>
              <label className="label mb-1.5 block">End</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} tnum`} />
            </div>
            <div>
              <label className="label mb-1.5 block">Initial cash</label>
              <input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="numeric" className={`${inputClass} tnum`} />
            </div>
            <div>
              <label className="label mb-1.5 block">Rebalance every (days)</label>
              <input value={step} onChange={(e) => setStep(e.target.value)} inputMode="numeric" className={`${inputClass} tnum`} />
            </div>
          </div>
          {start.isError && (
            <div className="mt-3 rounded-md border border-down/25 bg-down/10 px-3 py-2 text-2xs text-down">
              {start.error instanceof Error ? start.error.message : 'Failed to start backtest'}
            </div>
          )}
        </Panel>

        {activeId && data?.status === 'running' && (
          <Panel bodyClassName="p-5">
            <div className="flex items-center gap-3 text-sm text-muted">
              <Spinner /> Running backtest — {Math.round((data.progress ?? 0) * 100)}%
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(data.progress ?? 0) * 100}%` }} />
            </div>
          </Panel>
        )}

        {data?.status === 'error' && (
          <Panel bodyClassName="p-4">
            <ErrorState error={new Error(data.error ?? 'Backtest failed')} onRetry={run} />
          </Panel>
        )}

        {data?.status === 'done' && data.metrics && (
          <>
            <div className="panel grid grid-cols-2 gap-6 p-5 md:grid-cols-6">
              <Stat
                label="Total return"
                value={<span className={`tnum ${signClass(data.metrics.total_return_pct)}`}>{pct(data.metrics.total_return_pct)}</span>}
              />
              <Stat label="Sharpe" value={<span className="tnum">{data.metrics.sharpe_ratio != null ? num(data.metrics.sharpe_ratio, 2) : '—'}</span>} />
              <Stat
                label="Max drawdown"
                value={<span className="tnum text-down">{data.metrics.max_drawdown_pct != null ? `-${num(data.metrics.max_drawdown_pct, 2)}%` : '—'}</span>}
              />
              <Stat label="Win rate" value={<span className="tnum">{data.metrics.win_rate_pct != null ? `${num(data.metrics.win_rate_pct, 1)}%` : '—'}</span>} />
              <Stat label="Profit factor" value={<span className="tnum">{data.metrics.profit_factor != null ? num(data.metrics.profit_factor, 2) : '—'}</span>} />
              <Stat label="Trades" value={<span className="tnum">{data.metrics.total_trades}</span>} />
            </div>

            <Panel title="Equity curve vs benchmark" bodyClassName="p-4">
              {data.equity_curve && data.equity_curve.length >= 2 ? (
                <EquityChart points={data.equity_curve} benchmarkLabel={tickerLabel(data.benchmark ?? '')} />
              ) : (
                <Empty>Not enough data points to plot an equity curve.</Empty>
              )}
            </Panel>

            <Panel title={`Trade log (${data.trades?.length ?? 0})`} bodyClassName="p-0">
              {!data.trades?.length ? (
                <Empty>No trades were executed over this window.</Empty>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-panel">
                      <tr className="label border-b border-line text-right">
                        <th className="py-2 pl-4 text-left font-medium">Date</th>
                        <th className="px-2 text-left font-medium">Ticker</th>
                        <th className="px-2 font-medium">Action</th>
                        <th className="px-2 font-medium">Qty</th>
                        <th className="px-2 font-medium">Price</th>
                        <th className="py-2 pl-2 pr-4 text-left font-medium">Trigger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.trades.map((t, i) => (
                        <tr key={i} className="border-b border-line/60 last:border-0">
                          <td className="tnum py-2 pl-4 text-2xs text-muted">{dateOnly(t.date)}</td>
                          <td className="px-2 text-[13px] text-ink">{tickerLabel(t.ticker)}</td>
                          <td className="px-2 text-right"><ActionPill action={t.action} /></td>
                          <td className="tnum px-2 text-right text-[13px] text-ink">{num(t.quantity, 0)}</td>
                          <td className="tnum px-2 text-right text-[13px] text-ink">{num(t.price, 2)}</td>
                          <td className="py-2 pl-2 pr-4 text-2xs text-muted">{t.trigger}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {data.disclosure && (
              <div className="flex items-start gap-2 rounded-md border border-line bg-panel2 px-4 py-3 text-2xs leading-relaxed text-muted">
                <Info size={14} className="mt-0.5 shrink-0 text-accent" />
                <span>{data.disclosure}</span>
              </div>
            )}
          </>
        )}

        {!activeId && (
          <div className="flex items-start gap-2 rounded-md border border-line bg-panel2 px-4 py-3 text-2xs leading-relaxed text-muted">
            <Info size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>Backtests are point-in-time on prices &amp; fundamentals; news sentiment is excluded to avoid lookahead bias.</span>
          </div>
        )}
      </div>
    </div>
  );
}
