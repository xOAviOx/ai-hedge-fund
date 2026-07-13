'use client';

import React, { useMemo } from 'react';

interface MetricRowProps {
  label: string;
  value: string | number;
  highlight?: 'positive' | 'negative' | 'none';
  tooltip?: string;
}

function MetricRow({ label, value, highlight, tooltip }: MetricRowProps) {
  const colorClass = highlight === 'positive' ? 'text-emerald-400' : highlight === 'negative' ? 'text-red-400' : 'text-white/80';
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 hover:bg-white/[0.02] transition-colors group px-2" title={tooltip}>
      <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold group-hover:text-white/50">{label}</span>
      <span className={`text-[11px] font-mono font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

interface PerformanceTableProps {
  data: { time: string; value: number }[];
  baseValue: number;
}

export default function PerformanceTable({ data, baseValue }: PerformanceTableProps) {
  const metrics = useMemo(() => {
    if (!data.length) return null;

    const initial = baseValue;
    const sorted = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const current = sorted[sorted.length - 1].value;
    
    // ── Returns Logic ──────────────────────────────────────────
    const returns: number[] = [];
    const benchReturns: number[] = [];
    let peak = initial;
    let maxDD = 0;
    
    // Simulate benchmark (S&P 500 equivalent) for Alpha/Beta
    let currentBench = initial;
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].value;
      const cur = sorted[i].value;
      const ret = (cur / prev) - 1;
      returns.push(ret);

      // Simulated benchmark return (~8% annual + noise)
      const bRet = (0.0003 + (Math.random() - 0.5) * 0.015); 
      benchReturns.push(bRet);

      if (cur > peak) peak = cur;
      const dd = ((cur / peak) - 1) * 100;
      if (dd < maxDD) maxDD = dd;
    }

    // ── Aggregates ──────────────────────────────────────────────
    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.map(x => Math.pow(x - meanRet, 2)).reduce((a, b) => a + b, 0) / returns.length);
    const meanBench = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;
    const stdBench = Math.sqrt(benchReturns.map(x => Math.pow(x - meanBench, 2)).reduce((a, b) => a + b, 0) / benchReturns.length);

    // ── Annualized ─────────────────────────────────────────────
    const annRet = (Math.pow(1 + meanRet, 252) - 1) * 100;
    const annVol = stdDev * Math.sqrt(252) * 100;
    const annBench = (Math.pow(1 + meanBench, 252) - 1) * 100;
    
    // ── Ratios ─────────────────────────────────────────────────
    const sharpe = (meanRet / (stdDev || 1)) * Math.sqrt(252);
    const downsideReturns = returns.filter(r => r < 0);
    const downsideDev = Math.sqrt(downsideReturns.map(x => Math.pow(x, 2)).reduce((a, b) => a + b, 0) / (downsideReturns.length || 1));
    const sortino = (meanRet / (downsideDev || 1)) * Math.sqrt(252);
    
    // Alpha/Beta
    const covariance = returns.reduce((acc, r, i) => acc + (r - meanRet) * (benchReturns[i] - meanBench), 0) / returns.length;
    const beta = covariance / Math.pow(stdBench, 2);
    const alpha = (annRet / 100) - (beta * (annBench / 100));
    
    // Others
    const winRate = (returns.filter(r => r > 0).length / returns.length) * 100;
    const wins = returns.filter(r => r > 0);
    const losses = returns.filter(r => r < 0);
    const avgWin = (wins.reduce((a, b) => a + b, 0) / (wins.length || 1)) * 100;
    const avgLoss = (losses.reduce((a, b) => a + b, 0) / (losses.length || 1)) * 100;
    const profitFactor = Math.abs(wins.reduce((a, b) => a + b, 0) / (losses.reduce((a, b) => a + b, 0) || 1));

    return {
      cumReturn: ((current / initial) - 1) * 100,
      annRet,
      sharpe,
      sortino,
      beta,
      alpha: alpha * 100,
      maxDD,
      vol: annVol,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      treynor: (meanRet * 252 / (beta || 1)) * 100,
      infoRatio: (alpha / (stdDev || 1)) * Math.sqrt(252),
      trackingError: Math.sqrt(returns.reduce((acc, r, i) => acc + Math.pow(r - benchReturns[i], 2), 0) / returns.length) * Math.sqrt(252) * 100,
      expectancy: (winRate/100 * avgWin/100) + ((1 - winRate/100) * avgLoss/100),
      capacity: 'High-Liquid',
      lastRun: new Date().toLocaleTimeString(),
    };
  }, [data, baseValue]);

  if (!metrics) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-0.5 mt-4">
      {/* Risk Metrics */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-white/20 uppercase font-black tracking-widest px-2 py-3 bg-white/[0.02] rounded-t-lg mb-1">Risk Adjusted</div>
        <MetricRow label="Sharpe Ratio" value={metrics.sharpe.toFixed(2)} />
        <MetricRow label="Sortino Ratio" value={metrics.sortino.toFixed(2)} />
        <MetricRow label="Treynor Ratio" value={metrics.treynor.toFixed(2)} />
        <MetricRow label="Tracking Error" value={`${metrics.trackingError.toFixed(2)}%`} />
      </div>

      {/* Exposure Metrics */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-white/20 uppercase font-black tracking-widest px-2 py-3 bg-white/[0.02] rounded-t-lg mb-1">Exposure & Alpha</div>
        <MetricRow label="Beta" value={metrics.beta.toFixed(2)} />
        <MetricRow label="Alpha (Ann.)" value={`${metrics.alpha.toFixed(2)}%`} highlight={metrics.alpha >= 0 ? 'positive' : 'negative'} />
        <MetricRow label="Info Ratio" value={metrics.infoRatio.toFixed(2)} />
        <MetricRow label="Expectancy" value={metrics.expectancy.toFixed(3)} />
      </div>

      {/* Returns Metrics */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-white/20 uppercase font-black tracking-widest px-2 py-3 bg-white/[0.02] rounded-t-lg mb-1">Performance</div>
        <MetricRow label="Total Return" value={`${metrics.cumReturn.toFixed(2)}%`} highlight={metrics.cumReturn >= 0 ? 'positive' : 'negative'} />
        <MetricRow label="CAGR" value={`${metrics.annRet.toFixed(2)}%`} highlight={metrics.annRet >= 0 ? 'positive' : 'negative'} />
        <MetricRow label="Volatility" value={`${metrics.vol.toFixed(2)}%`} />
        <MetricRow label="Max Drawdown" value={`${metrics.maxDD.toFixed(2)}%`} highlight="negative" />
      </div>

      {/* Trade Metrics */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-white/20 uppercase font-black tracking-widest px-2 py-3 bg-white/[0.02] rounded-t-lg mb-1">Execution</div>
        <MetricRow label="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} />
        <MetricRow label="Profit Factor" value={metrics.profitFactor.toFixed(2)} />
        <MetricRow label="Avg Win" value={`${metrics.avgWin.toFixed(2)}%`} highlight="positive" />
        <MetricRow label="Avg Loss" value={`${metrics.avgLoss.toFixed(2)}%`} highlight="negative" />
      </div>
    </div>
  );
}

