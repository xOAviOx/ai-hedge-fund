'use client';

import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

import type { NavPoint, OHLCVBar } from '@/lib/types';

const toTs = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

// Dedupe + sort by time (lightweight-charts requires strictly ascending unique times).
function clean<T extends { time: UTCTimestamp; value: number }>(rows: T[]): T[] {
  const seen = new Map<number, T>();
  for (const r of rows) if (Number.isFinite(r.value)) seen.set(r.time, r);
  return Array.from(seen.values()).sort((a, b) => a.time - b.time);
}

export default function PerfChart({
  nav,
  benchmark,
  benchmarkLabel,
  height = 300,
}: {
  nav: NavPoint[];
  benchmark?: OHLCVBar[];
  benchmarkLabel?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const navRef = useRef<ISeriesApi<'Area'> | null>(null);
  const benchRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Build the chart once.
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
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(255,255,255,0.15)', labelBackgroundColor: '#12141b' },
        horzLine: { color: 'rgba(255,255,255,0.15)', labelBackgroundColor: '#12141b' },
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    navRef.current = chart.addSeries(AreaSeries, {
      lineColor: '#4c8fe8',
      topColor: 'rgba(76,143,232,0.20)',
      bottomColor: 'rgba(76,143,232,0.00)',
      lineWidth: 2,
      priceLineVisible: false,
    });
    benchRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(230,232,236,0.35)',
      lineWidth: 1,
      priceLineVisible: false,
      lineStyle: 2,
    });

    const resize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
      chartRef.current = null;
      navRef.current = null;
      benchRef.current = null;
    };
  }, [height]);

  // Push data. Benchmark is rebased to the fund's starting NAV so both share the ₹ axis.
  useEffect(() => {
    if (!navRef.current || !benchRef.current || !chartRef.current) return;

    const navRows = clean(nav.map((p) => ({ time: toTs(p.ts), value: p.nav })));
    navRef.current.setData(navRows);

    if (benchmark && benchmark.length && navRows.length) {
      const base = navRows[0].value;
      const b0 = benchmark.find((b) => Number.isFinite(b.close))?.close;
      if (b0) {
        const rebased = clean(
          benchmark.map((b) => ({ time: toTs(b.ts), value: (b.close / b0) * base })),
        );
        benchRef.current.setData(rebased);
      } else {
        benchRef.current.setData([]);
      }
    } else {
      benchRef.current.setData([]);
    }

    chartRef.current.timeScale().fitContent();
  }, [nav, benchmark]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full" style={{ height }} />
      {benchmarkLabel && benchmark && benchmark.length > 0 && (
        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-3 text-2xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-accent" /> NAV
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-white/35" /> {benchmarkLabel}
          </span>
        </div>
      )}
    </div>
  );
}
