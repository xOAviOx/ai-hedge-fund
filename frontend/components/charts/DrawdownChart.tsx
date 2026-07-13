'use client';

import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';

import type { NavPoint } from '@/lib/types';

const toTs = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

// Underwater (drawdown) curve, computed from NAV history: (nav / running-peak - 1) * 100.
export default function DrawdownChart({ nav, height = 200 }: { nav: NavPoint[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(230,232,236,0.45)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: { mode: 1 },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#f6465d',
      topColor: 'rgba(246,69,93,0.05)',
      bottomColor: 'rgba(246,69,93,0.35)',
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(1)}%` },
    });

    let peak = -Infinity;
    const seen = new Set<number>();
    const rows: { time: UTCTimestamp; value: number }[] = [];
    for (const p of nav) {
      peak = Math.max(peak, p.nav);
      const time = toTs(p.ts);
      if (seen.has(time)) continue;
      seen.add(time);
      rows.push({ time, value: peak > 0 ? (p.nav / peak - 1) * 100 : 0 });
    }
    rows.sort((a, b) => a.time - b.time);
    series.setData(rows);
    chart.timeScale().fitContent();

    const resize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
      chartRef.current = null;
    };
  }, [nav, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
