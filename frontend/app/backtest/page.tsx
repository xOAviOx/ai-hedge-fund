'use client';

import { FlaskConical, Info } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import { Badge, Panel } from '@/components/ui';

const METRICS = ['CAGR', 'Sharpe', 'Max drawdown', 'Win rate'];

export default function BacktestPage() {
  return (
    <div>
      <PageHeader
        title="Backtest Lab"
        subtitle="Run the agent pipeline over a historical window with point-in-time data."
        actions={<Badge tone="muted">Phase 6</Badge>}
      />

      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Panel bodyClassName="p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5 text-muted">
              <FlaskConical size={22} />
            </span>
            <h2 className="text-sm font-medium text-ink">Point-in-time backtesting arrives in Phase 6</h2>
            <p className="max-w-lg text-xs leading-relaxed text-muted">
              The lab will replay the same agent pipeline weekly across a historical window, then render an equity curve
              vs benchmark, a metrics table, and a full trade log. The engine reuses the existing backtest tracker,
              adapted for point-in-time prefetch.
            </p>
            <button
              disabled
              className="cursor-not-allowed rounded-md border border-line px-4 py-2 text-xs text-muted opacity-60"
            >
              Run backtest — not available yet
            </button>
            <p className="text-2xs text-muted">
              The API route (<span className="tnum">POST /api/v1/backtest/run</span>) is mounted and returns an honest
              501 until the engine ships — no placeholder results.
            </p>
          </div>
        </Panel>

        <Panel title="Planned metrics" bodyClassName="p-4">
          <div className="flex flex-wrap gap-2">
            {METRICS.map((m) => (
              <span key={m} className="rounded border border-line bg-panel2 px-2.5 py-1 text-2xs text-muted">
                {m}
              </span>
            ))}
          </div>
        </Panel>

        <div className="flex items-start gap-2 rounded-md border border-line bg-panel2 px-4 py-3 text-2xs leading-relaxed text-muted">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" />
          <span>
            Backtests are point-in-time on prices &amp; fundamentals; news sentiment is excluded to avoid lookahead bias.
          </span>
        </div>
      </div>
    </div>
  );
}
