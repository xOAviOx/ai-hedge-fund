'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';

import type { OHLCVBar } from '@/lib/types';

const toTs = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

export default function PriceChart({ bars, height = 340 }: { bars: OHLCVBar[]; height?: number }) {
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
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(255,255,255,0.15)', labelBackgroundColor: '#12141b' },
        horzLine: { color: 'rgba(255,255,255,0.15)', labelBackgroundColor: '#12141b' },
      },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#2ebd85',
      downColor: '#f6465d',
      borderVisible: false,
      wickUpColor: '#2ebd85',
      wickDownColor: '#f6465d',
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const seen = new Set<number>();
    const ohlc: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = [];
    const vol: { time: UTCTimestamp; value: number; color: string }[] = [];
    for (const b of bars) {
      const time = toTs(b.ts);
      if (seen.has(time)) continue;
      seen.add(time);
      ohlc.push({ time, open: b.open, high: b.high, low: b.low, close: b.close });
      vol.push({
        time,
        value: b.volume ?? 0,
        color: b.close >= b.open ? 'rgba(46,189,133,0.3)' : 'rgba(246,69,93,0.3)',
      });
    }
    ohlc.sort((a, b) => a.time - b.time);
    vol.sort((a, b) => a.time - b.time);
    candles.setData(ohlc);
    volume.setData(vol);
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
  }, [bars, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
