'use client';

import React, { useMemo } from 'react';

interface MonthlyReturnsHeatmapProps {
  data: { time: string; value: number }[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MonthlyReturnsHeatmap({ data }: MonthlyReturnsHeatmapProps) {
  const tableData = useMemo(() => {
    if (!data.length) return null;

    const returnsByYearMonth: Record<number, Record<number, number>> = {};
    const years = new Set<number>();

    // Sort data to be safe
    const sorted = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    for (let i = 1; i < sorted.length; i++) {
        const d_prev = new Date(sorted[i-1].time);
        const d_cur = new Date(sorted[i].time);
        
        // Only calculate when moving from one month to another or at end of month
        // For a more accurate heatmap, we should probably group by month first
    }

    // Simplified logic: Group by Year and Month, take first and last of month
    const grouped: Record<number, Record<number, { first: number, last: number }>> = {};
    
    sorted.forEach(item => {
        const d = new Date(item.time);
        const y = d.getFullYear();
        const m = d.getMonth();
        years.add(y);

        if (!grouped[y]) grouped[y] = {};
        if (!grouped[y][m]) grouped[y][m] = { first: item.value, last: item.value };
        grouped[y][m].last = item.value;
    });

    const yearsList = Array.from(years).sort((a, b) => b - a);
    const finalTable: { year: number, months: (number | null)[], total: number }[] = [];

    yearsList.forEach(y => {
        const monthsRet: (number | null)[] = [];
        let yearCum = 1;
        for (let m = 0; m < 12; m++) {
            if (grouped[y] && grouped[y][m]) {
                const ret = (grouped[y][m].last / grouped[y][m].first) - 1;
                monthsRet.push(ret * 100);
                yearCum *= (1 + ret);
            } else {
                monthsRet.push(null);
            }
        }
        finalTable.push({ year: y, months: monthsRet, total: (yearCum - 1) * 100 });
    });

    return finalTable;
  }, [data]);

  if (!tableData) return null;

  const getBgColor = (val: number | null) => {
    if (val === null) return 'bg-transparent';
    if (val > 0) {
      if (val > 5) return 'bg-emerald-500/40 text-emerald-200';
      if (val > 2) return 'bg-emerald-500/20 text-emerald-300';
      return 'bg-emerald-500/10 text-emerald-400';
    }
    if (val < 0) {
      if (val < -5) return 'bg-red-500/40 text-red-200';
      if (val < -2) return 'bg-red-500/20 text-red-300';
      return 'bg-red-500/10 text-red-400';
    }
    return 'bg-white/5 text-white/40';
  };

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="p-2 text-[10px] text-white/20 uppercase font-black tracking-widest text-left">Year</th>
            {MONTH_NAMES.map(m => (
              <th key={m} className="p-2 text-[10px] text-white/20 uppercase font-black tracking-widest">{m}</th>
            ))}
            <th className="p-2 text-[10px] text-white/20 uppercase font-black tracking-widest text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {tableData.map(row => (
            <tr key={row.year} className="group">
              <td className="p-2 text-xs font-bold text-white/40 group-hover:text-white transition-colors">{row.year}</td>
              {row.months.map((m, i) => (
                <td key={i} className={`p-2 text-[10px] font-mono font-bold text-center rounded-md border border-white/5 transition-all hover:scale-105 hover:z-10 cursor-default ${getBgColor(m)}`}>
                  {m !== null ? `${m > 0 ? '+' : ''}${m.toFixed(1)}%` : '-'}
                </td>
              ))}
              <td className={`p-2 text-xs font-bold text-right font-mono ${row.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.total > 0 ? '+' : ''}{row.total.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
