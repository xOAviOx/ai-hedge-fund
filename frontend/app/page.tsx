'use client';

import { useMemo, useState } from 'react';
import { Pause, Play, RefreshCw } from 'lucide-react';

import { useBenchmark, useFund, useNavHistory, useOrders, usePositions, useRunNow, useStats, useTogglePause } from '@/lib/hooks';
import { money, moneyCompact, pct, signClass, tickerLabel } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { ErrorState, Loading, Panel, Spinner, Stat } from '@/components/ui';
import PerfChart from '@/components/charts/PerfChart';
import PositionsTable from '@/components/fund/PositionsTable';
import OrdersList from '@/components/fund/OrdersList';
import NextRun from '@/components/fund/NextRun';

type Bench = 'none' | '^NSEI' | 'SPY';
const BENCH_LABEL: Record<Bench, string> = { none: '', '^NSEI': 'NIFTY 50', SPY: 'S&P 500' };

export default function FundConsolePage() {
  const [bench, setBench] = useState<Bench>('^NSEI');

  const fund = useFund();
  const nav = useNavHistory();
  const positions = usePositions();
  const orders = useOrders(8);
  const stats = useStats();
  const runNow = useRunNow();
  const togglePause = useTogglePause();

  const navPoints = nav.data ?? [];
  const navStart = navPoints[0]?.ts;
  const benchmark = useBenchmark(bench === 'none' ? '' : bench, navStart, bench !== 'none' && navPoints.length > 0);
  const benchBars = useMemo(
    () => (benchmark.data?.bars ?? []).filter((b) => (navStart ? b.ts >= navStart : true)),
    [benchmark.data, navStart],
  );

  if (fund.isLoading) {
    return (
      <div>
        <PageHeader title="Fund Console" subtitle="The Stratton Fund at a glance." />
        <Loading label="Loading fund" />
      </div>
    );
  }
  if (fund.isError || !fund.data) {
    return (
      <div>
        <PageHeader title="Fund Console" subtitle="The Stratton Fund at a glance." />
        <ErrorState error={fund.error} onRetry={() => fund.refetch()} />
      </div>
    );
  }

  const f = fund.data;
  const positionsValue = f.latest_nav - f.cash;
  const totalPnl = f.latest_nav - f.starting_cash;
  const totalPnlPct = f.starting_cash > 0 ? (f.latest_nav / f.starting_cash - 1) * 100 : 0;
  const job = stats.data?.scheduler.jobs[0];

  return (
    <div>
      <PageHeader
        title="Fund Console"
        subtitle={
          <span>
            {f.universe.length} tickers · base {f.base_currency}
            {f.is_paused && <span className="ml-2 text-down">· paused</span>}
          </span>
        }
        actions={
          <>
            <button
              onClick={() => togglePause.mutate(!f.is_paused)}
              disabled={togglePause.isPending}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                f.is_paused
                  ? 'border-up/30 bg-up/10 text-up hover:bg-up/15'
                  : 'border-line text-muted hover:bg-white/5 hover:text-ink'
              }`}
            >
              {f.is_paused ? <Play size={14} /> : <Pause size={14} />}
              {f.is_paused ? 'Resume fund' : 'Kill-switch'}
            </button>
            <button
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending || f.is_paused}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {runNow.isPending ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={14} />}
              Run now
            </button>
          </>
        }
      />

      <div className="space-y-4 p-6">
        {runNow.isError && (
          <div className="rounded-md border border-down/25 bg-down/10 px-4 py-2 text-xs text-down">
            Run failed: {runNow.error instanceof Error ? runNow.error.message : 'unknown error'}
          </div>
        )}
        {runNow.data?.status === 'paused' && (
          <div className="rounded-md border border-line bg-panel2 px-4 py-2 text-xs text-muted">
            Fund is paused — the run was skipped. Resume the fund to trade.
          </div>
        )}

        {/* Stat row */}
        <div className="panel grid grid-cols-2 gap-6 p-5 md:grid-cols-5">
          <Stat label="Net asset value" value={money(f.latest_nav, f.base_currency)} />
          <Stat
            label="Total P&L"
            value={<span className={signClass(totalPnl)}>{money(totalPnl, f.base_currency)}</span>}
            sub={<span className={signClass(totalPnlPct)}>{pct(totalPnlPct)}</span>}
          />
          <Stat label="Cash" value={money(f.cash, f.base_currency)} sub={`${((f.cash / f.latest_nav) * 100).toFixed(1)}% of NAV`} />
          <Stat label="Positions value" value={money(positionsValue, f.base_currency)} />
          <NextRun nextRunTime={job?.next_run_time ?? null} fallback={f.schedule_cron} />
        </div>

        {/* Performance */}
        <Panel
          title="NAV vs benchmark"
          right={
            <div className="flex items-center gap-1">
              {(['^NSEI', 'SPY'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBench((cur) => (cur === b ? 'none' : b))}
                  className={`rounded border px-2 py-1 text-2xs font-medium transition-colors ${
                    bench === b ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {BENCH_LABEL[b]}
                </button>
              ))}
            </div>
          }
          bodyClassName="p-4"
        >
          {navPoints.length >= 2 ? (
            <PerfChart nav={navPoints} benchmark={bench === 'none' ? undefined : benchBars} benchmarkLabel={BENCH_LABEL[bench]} />
          ) : (
            <div className="py-14 text-center text-sm text-muted">
              No NAV history yet. Hit <span className="text-ink">Run now</span> to generate the first snapshot.
            </div>
          )}
        </Panel>

        {/* Positions + orders */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title={`Positions (${positions.data?.length ?? 0})`} className="lg:col-span-2" bodyClassName="p-0">
            {positions.isLoading ? (
              <Loading label="Loading positions" />
            ) : positions.isError ? (
              <ErrorState error={positions.error} onRetry={() => positions.refetch()} />
            ) : (
              <PositionsTable positions={positions.data ?? []} />
            )}
          </Panel>

          <Panel title="Recent orders" bodyClassName="p-0">
            {orders.isLoading ? (
              <Loading label="Loading orders" />
            ) : orders.isError ? (
              <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
            ) : (
              <OrdersList orders={orders.data ?? []} />
            )}
          </Panel>
        </div>

        {/* Universe chips */}
        <Panel title="Universe" bodyClassName="p-4">
          <div className="flex flex-wrap gap-1.5">
            {f.universe.map((t) => (
              <span key={t} className="tnum rounded border border-line bg-panel2 px-2 py-1 text-2xs text-muted">
                {tickerLabel(t)}
              </span>
            ))}
          </div>
        </Panel>

        {stats.data && (
          <p className="tnum text-2xs text-muted">
            cache hit-rate {(stats.data.cache.hit_rate * 100).toFixed(1)}% · {stats.data.cache.provider_calls} provider calls ·{' '}
            {moneyCompact(stats.data.llm_cost, 'USD')} LLM cost · scheduler {stats.data.scheduler.running ? 'running' : 'stopped'}
          </p>
        )}
      </div>
    </div>
  );
}
