'use client';

import { useFund, useNavHistory, useRisk } from '@/lib/hooks';
import { money, num, pct, tickerLabel } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { Empty, ErrorState, Loading, Panel, Stat } from '@/components/ui';
import DrawdownChart from '@/components/charts/DrawdownChart';

export default function RiskPage() {
  const risk = useRisk();
  const nav = useNavHistory();
  const fund = useFund();
  const ccy = fund.data?.base_currency ?? 'INR';

  if (risk.isLoading) {
    return (
      <div>
        <PageHeader title="Risk Desk" subtitle="Live portfolio risk." />
        <Loading label="Loading risk metrics" />
      </div>
    );
  }
  if (risk.isError || !risk.data) {
    return (
      <div>
        <PageHeader title="Risk Desk" subtitle="Live portfolio risk." />
        <ErrorState error={risk.error} onRetry={() => risk.refetch()} />
      </div>
    );
  }

  const r = risk.data;
  const navPoints = nav.data ?? [];

  return (
    <div>
      <PageHeader title="Risk Desk" subtitle="Volatility, drawdown, and exposure from the live ledger." />
      <div className="space-y-4 p-6">
        <div className="panel grid grid-cols-2 gap-6 p-5 md:grid-cols-4">
          <Stat label="Current NAV" value={<span className="tnum">{money(r.current_nav, ccy)}</span>} />
          <Stat
            label="Volatility (per-run σ)"
            value={<span className="tnum">{r.volatility_pct != null ? pct(r.volatility_pct, 3, false) : '—'}</span>}
          />
          <Stat
            label="Max drawdown"
            value={<span className="tnum text-down">{r.max_drawdown_pct != null ? pct(r.max_drawdown_pct, 2, false) : '—'}</span>}
          />
          <Stat label="Observations" value={<span className="tnum">{r.nav_points}</span>} />
        </div>

        <Panel title="Drawdown (underwater curve)" bodyClassName="p-4">
          {navPoints.length >= 2 ? (
            <DrawdownChart nav={navPoints} />
          ) : (
            <div className="py-12 text-center text-sm text-muted">
              Not enough NAV history yet — run the fund on a few sessions to build a drawdown curve.
            </div>
          )}
        </Panel>

        <Panel title={`Position exposure (${r.exposure.length})`} bodyClassName="p-0">
          {r.exposure.length === 0 ? (
            <Empty>No positions to measure exposure on.</Empty>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="label border-b border-line text-right">
                  <th className="py-2 pl-4 text-left font-medium">Ticker</th>
                  <th className="px-2 font-medium">Cost basis</th>
                  <th className="px-2 font-medium">Weight</th>
                  <th className="py-2 pl-2 pr-4 text-left font-medium">Share of book</th>
                </tr>
              </thead>
              <tbody>
                {r.exposure.map((e) => (
                  <tr key={e.ticker} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5 pl-4 text-[13px] text-ink">{tickerLabel(e.ticker)}</td>
                    <td className="tnum px-2 text-right text-[13px] text-ink">{money(e.cost_basis, ccy)}</td>
                    <td className="tnum px-2 text-right text-[13px] text-ink">{num(e.weight_pct, 2)}%</td>
                    <td className="py-2.5 pl-2 pr-4">
                      <div className="ml-auto h-2 w-40 overflow-hidden rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, e.weight_pct)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <p className="text-2xs text-muted">{r.note}</p>
      </div>
    </div>
  );
}
