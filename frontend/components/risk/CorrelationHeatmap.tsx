'use client';

import type { CorrelationMatrix } from '@/lib/types';
import { tickerLabel } from '@/lib/format';
import { Empty } from '@/components/ui';

// Correlation isn't P&L, so it uses the accent scale (not green/red): opacity
// tracks |r|, and negative correlations are outlined to distinguish them.
function cell(v: number | null): { style: React.CSSProperties; text: string } {
  if (v == null) return { style: { background: 'transparent' }, text: '—' };
  const alpha = Math.min(1, Math.abs(v)) * 0.55;
  return {
    style: {
      background: `rgba(76,143,232,${alpha.toFixed(3)})`,
      boxShadow: v < 0 ? 'inset 0 0 0 1px rgba(246,69,93,0.4)' : undefined,
    },
    text: v.toFixed(2),
  };
}

export default function CorrelationHeatmap({ data }: { data: CorrelationMatrix }) {
  const { tickers, matrix } = data;
  if (tickers.length < 2) return <Empty>Need at least two holdings for a correlation matrix.</Empty>;

  return (
    <div className="overflow-x-auto p-4">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="p-1" />
            {tickers.map((t) => (
              <th key={t} className="label px-1 pb-1 text-center font-medium">
                {tickerLabel(t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowT, i) => (
            <tr key={rowT}>
              <td className="label pr-2 text-right font-medium">{tickerLabel(rowT)}</td>
              {tickers.map((colT, j) => {
                const c = cell(matrix[i]?.[j] ?? null);
                return (
                  <td
                    key={colT}
                    className="tnum h-9 w-14 rounded text-center text-2xs text-ink"
                    style={c.style}
                    title={`${tickerLabel(rowT)} · ${tickerLabel(colT)}`}
                  >
                    {c.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
