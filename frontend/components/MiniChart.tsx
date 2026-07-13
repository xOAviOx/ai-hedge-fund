'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, AreaSeries, HistogramSeries } from 'lightweight-charts';

interface MiniChartProps {
  ticker: string;
  name: string;
  data: { time: string; value: number; volume: number }[];
  height?: number;
  live?: boolean;
  pollIntervalMs?: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function MiniChart({ ticker, name, data, height = 250, live = false, pollIntervalMs = 8000 }: MiniChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const areaSeriesRef = useRef<any>(null);
  const chartRef = useRef<any>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePct, setLivePct] = useState<number | null>(null);
  const [livePulse, setLivePulse] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const initial = data[0].value;
    const last = data[data.length - 1].value;
    const isUp = last >= initial;

    const lineColor  = isUp ? '#059669' : '#dc2626';
    const topColor   = isUp ? 'rgba(5, 150, 105, 0.4)' : 'rgba(220, 38, 38, 0.4)';
    const bottomColor = 'rgba(0,0,0,0)';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, timeVisible: true },
      handleScroll: false,
      handleScale: false,
      crosshair: { mode: 1, vertLine: { color: 'rgba(255,255,255,0.2)' }, horzLine: { color: 'rgba(255,255,255,0.2)' } },
    });
    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor, topColor, bottomColor,
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    areaSeriesRef.current = areaSeries;
    areaSeries.setData(data.map(d => ({ time: d.time as any, value: d.value })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: isUp ? 'rgba(5, 150, 105, 0.4)' : 'rgba(220, 38, 38, 0.4)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeries.setData(data.map(d => ({ time: d.time as any, value: d.volume })));

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      areaSeriesRef.current = null;
    };
  }, [data]);

  // Live polling
  useEffect(() => {
    if (!live) return;

    const fetchLive = async () => {
      try {
        const r = await fetch(`${API}/api/price/${ticker}`);
        const d = await r.json();
        if (d.error || !d.price) return;

        setLivePrice(d.price);
        setLivePct(d.change_pct);
        setLivePulse(true);
        setTimeout(() => setLivePulse(false), 600);

        if (areaSeriesRef.current) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const ts = Math.floor(today.getTime() / 1000) as any;
          areaSeriesRef.current.update({ time: ts, value: d.price });
        }
      } catch {}
    };

    fetchLive();
    const id = setInterval(fetchLive, pollIntervalMs);
    return () => clearInterval(id);
  }, [live, ticker, pollIntervalMs]);

  const displayPrice = livePrice ?? (data.length > 0 ? data[data.length - 1].value : 0);
  const initialValue = data.length > 0 ? data[0].value : 0;
  const isUp = displayPrice >= initialValue;
  const pct  = livePct ?? (initialValue ? ((displayPrice - initialValue) / initialValue) * 100 : 0);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-white/5 bg-[#0a0a0b]">
      {/* Ticker info */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none flex items-center gap-3">
        <div className="bg-white/10 rounded-full w-6 h-6 flex items-center justify-center">
          <span className="text-[10px] text-white font-bold">{ticker[0]}</span>
        </div>
        <div className="flex bg-white/5 border border-white/10 rounded-md overflow-hidden">
          <span className="px-2 py-1 text-xs font-bold text-white bg-white/10">{ticker}</span>
          <span className="px-2 py-1 text-[10px] text-white/50">{name}</span>
        </div>
        {live && (
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 transition-opacity ${livePulse ? 'opacity-100' : 'opacity-70'}`}>
            <span className={`w-1 h-1 rounded-full bg-emerald-400 ${livePulse ? 'animate-ping' : 'animate-pulse'}`} />
            LIVE
          </span>
        )}
      </div>

      {/* Price badge */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none flex flex-col items-end gap-1">
        <div className={`px-3 py-1 rounded font-mono text-xs font-bold transition-all ${isUp ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'} ${livePulse ? 'scale-105' : ''}`}>
          ₹{displayPrice.toFixed(2)}
        </div>
        <div className={`text-[10px] font-mono font-semibold ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full mt-2" style={{ height: `${height}px` }} />
    </div>
  );
}
