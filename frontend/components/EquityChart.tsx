'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, AreaSeries, LineSeries } from 'lightweight-charts';

export interface EquityData {
  time: string;
  value: number;
}

interface EquityChartProps {
  data: EquityData[];
  baseValue?: number;
  height?: number;
  showBenchmark?: boolean;
}

export default function EquityChart({ data, baseValue, height = 350, showBenchmark = true }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({
    pnl: 0,
    pnlPct: 0,
    current: 0,
    benchmark: 0,
    benchmarkPct: 0,
    isPositive: true,
  });

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    };

    const initialValue = baseValue !== undefined ? baseValue : data[0].value;
    const sortedData = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const lastValue = sortedData[sortedData.length - 1].value;
    
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(156, 163, 175, 0.6)',
        fontSize: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(124, 58, 237, 0.3)',
          width: 1,
          style: 3, // Dash
          labelBackgroundColor: '#1f2937',
        },
        horzLine: {
          visible: false,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        alignLabels: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        rightOffset: 10,
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
    });

    // ── Main Portfolio Series ────────────────────────────────────────────────
    const isProfitable = lastValue >= initialValue;
    const lineColor = isProfitable ? '#10B981' : '#EF4444';
    const topColor = isProfitable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    const bottomColor = isProfitable ? 'rgba(16, 185, 129, 0.01)' : 'rgba(239, 68, 68, 0.01)';

    const series = chart.addSeries(AreaSeries, {
      lineColor: lineColor,
      topColor: topColor,
      bottomColor: bottomColor,
      lineWidth: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    series.setData(sortedData);

    // ── Benchmark Series (Simulated S&P 500) ────────────────────────────────
    let benchmarkSeries: any = null;
    let benchmarkData: any[] = [];
    if (showBenchmark) {
      benchmarkSeries = chart.addSeries(LineSeries, {
        color: 'rgba(156, 163, 175, 0.5)',
        lineWidth: 1,
        lineStyle: 2, // Dotted
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      // Simulate benchmark starting at the same initial value
      // with a slight 8% yearly drift and noise
      let currentBench = initialValue;
      benchmarkData = sortedData.map((d, i) => {
        if (i === 0) return { time: d.time, value: initialValue };
        const drift = (0.08 / 252); // Assuming 8% annual return over 252 trading days
        const noise = (Math.random() - 0.5) * 0.01;
        currentBench = currentBench * (1 + drift + noise);
        return { time: d.time, value: currentBench };
      });
      benchmarkSeries.setData(benchmarkData);
    }

    // ── Metrics Logic ────────────────────────────────────────────────────────
    const updateMetrics = (time: any) => {
      const dataPoint = sortedData.find(d => d.time === time) || sortedData[sortedData.length - 1];
      const benchPoint = benchmarkData.find(d => d.time === time) || benchmarkData[benchmarkData.length - 1];
      
      const currentVal = dataPoint.value;
      const pnl = currentVal - initialValue;
      const pnlPct = (pnl / initialValue) * 100;
      const benchVal = benchPoint?.value || initialValue;
      const benchPct = ((benchVal / initialValue) - 1) * 100;

      setMetrics({
        pnl,
        pnlPct,
        current: currentVal,
        benchmark: benchVal,
        benchmarkPct: benchPct,
        isPositive: pnl >= 0,
      });
    };

    updateMetrics(sortedData[sortedData.length - 1].time);

    chart.subscribeCrosshairMove(param => {
      if (param.time) {
        updateMetrics(param.time);
      } else {
        updateMetrics(sortedData[sortedData.length - 1].time);
      }
    });

    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, baseValue, height, showBenchmark]);

  return (
    <div className="flex flex-col w-full h-full relative group">
      {/* Floating Header Metrics */}
      <div className="flex justify-between items-start mb-4 px-2">
        <div>
          <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-semibold mb-1">Portfolio Equity</div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-medium tracking-tight text-white">${metrics.current?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${metrics.isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {metrics.isPositive ? '+' : ''}{metrics.pnlPct?.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-semibold mb-1 text-right">vs Benchmark</div>
          <div className="text-xs font-medium text-white/60">
            S&P 500: <span className={metrics.benchmarkPct >= 0 ? 'text-emerald-500/60' : 'text-red-500/60'}>
              {metrics.benchmarkPct >= 0 ? '+' : ''}{metrics.benchmarkPct?.toFixed(2)}%
            </span>
          </div>
          <div className={`text-[10px] font-bold mt-1 ${metrics.pnlPct > metrics.benchmarkPct ? 'text-purple-400' : 'text-white/20'}`}>
            {metrics.pnlPct > metrics.benchmarkPct ? 'ALPHA: +' + (metrics.pnlPct - metrics.benchmarkPct).toFixed(2) + '%' : 'UNDERPERFORMING'}
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full relative flex-1" />

      {/* Modern Backdrop Gradients */}
      <div className="absolute -z-10 top-0 left-0 w-full h-full bg-gradient-to-tr from-purple-500/5 via-transparent to-emerald-500/5 opacity-50 blur-3xl pointer-events-none" />
    </div>
  );
}

