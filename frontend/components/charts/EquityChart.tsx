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

import type { EquityPoint } from '@/lib/types';

const toTs = (d: string): UTCTimestamp => Math.floor(new Date(d).getTime() / 1000) as UTCTimestamp;

export default function EquityChart({
  points,
  benchmarkLabel,
  height = 300,
}: {
  points: EquityPoint[];
  benchmarkLabel?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const equityRef = useRef<ISeriesApi<'Area'> | null>(null);
  const benchRef = useRef<ISeriesApi<'Line'> | null>(null);

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
    equityRef.current = chart.addSeries(AreaSeries, {
      lineColor: '#4c8fe8',
      topColor: 'rgba(76,143,232,0.20)',
      bottomColor: 'rgba(76,143,232,0.00)',
      lineWidth: 2,
      priceLineVisible: false,
    });
    benchRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(230,232,236,0.35)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
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
      equityRef.current = null;
      benchRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!equityRef.current || !benchRef.current || !chartRef.current) return;
    const seen = new Set<number>();
    const eq: { time: UTCTimestamp; value: number }[] = [];
    const bench: { time: UTCTimestamp; value: number }[] = [];
    for (const p of points) {
      const time = toTs(p.date);
      if (seen.has(time)) continue;
      seen.add(time);
      eq.push({ time, value: p.value });
      if (p.benchmark != null) bench.push({ time, value: p.benchmark });
    }
    equityRef.current.setData(eq);
    benchRef.current.setData(bench);
    chartRef.current.timeScale().fitContent();
  }, [points]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full" style={{ height }} />
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-3 text-2xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-accent" /> Fund
        </span>
        {benchmarkLabel && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-white/35" /> {benchmarkLabel}
          </span>
        )}
      </div>
    </div>
  );
}
