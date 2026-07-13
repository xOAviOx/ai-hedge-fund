'use client';

import { Empty } from '@/components/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Monthly returns ARE P&L → green/red, intensity by magnitude.
function cellStyle(v: number | undefined): React.CSSProperties {
  if (v == null) return { background: 'transparent' };
  const mag = Math.min(1, Math.abs(v) / 8) * 0.5; // ~8% saturates
  const color = v >= 0 ? `rgba(46,189,133,${mag.toFixed(3)})` : `rgba(246,69,93,${mag.toFixed(3)})`;
  return { background: color };
}

export default function MonthlyReturnsHeatmap({ data }: { data: Record<string, number> }) {
  const keys = Object.keys(data);
  if (!keys.length) return <Empty>No monthly return history yet.</Empty>;

  const years = Array.from(new Set(keys.map((k) => k.slice(0, 4)))).sort();

  return (
    <div className="overflow-x-auto p-4">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="p-1" />
            {MONTHS.map((m) => (
              <th key={m} className="label px-1 pb-1 text-center font-medium">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td className="label pr-2 text-right font-medium">{y}</td>
              {MONTHS.map((_, mi) => {
                const key = `${y}-${String(mi + 1).padStart(2, '0')}`;
                const v = data[key];
                return (
                  <td
                    key={key}
                    className="tnum h-9 w-12 rounded text-center text-2xs text-ink"
                    style={cellStyle(v)}
                    title={key}
                  >
                    {v != null ? v.toFixed(1) : ''}
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
