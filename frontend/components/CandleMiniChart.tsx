'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

interface CandleMiniChartProps {
  ticker: string;
  height?: number;
  live?: boolean;
  pollIntervalMs?: number;
  onSelect?: (ticker: string) => void;
  selected?: boolean;
  usdToInr?: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function CandleMiniChart({
  ticker, height = 200, live = true, pollIntervalMs = 8000, onSelect, selected = false, usdToInr,
}: CandleMiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const candleRef = useRef<any>(null);
  const volRef = useRef<any>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [changePct, setChangePct] = useState<number | null>(null);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('USD');
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);

  // Build chart + load history
  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'Inter, system-ui' },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderVisible: false, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: 1, vertLine: { color: 'rgba(255,255,255,0.15)' }, horzLine: { color: 'rgba(255,255,255,0.15)' } },
      handleScroll: false,
      handleScale: false,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    candleRef.current = candleSeries;

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: '',
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = volSeries;

    const load = async () => {
      try {
        const r = await fetch(`${API}/api/history/${ticker}?period=1mo`);
        const d = await r.json();
        if (d.history?.length) {
          const ohlc = d.history.map((h: any) => ({ time: h.date, open: h.open, high: h.high, low: h.low, close: h.close }));
          const vol  = d.history.map((h: any) => ({ time: h.date, value: h.volume, color: h.close >= h.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }));
          candleSeries.setData(ohlc);
          volSeries.setData(vol);
          chart.timeScale().fitContent();
          const last = d.history[d.history.length - 1];
          setPrice(last.close);
          const first = d.history[0];
          setChangePct(first.close ? ((last.close - first.close) / first.close) * 100 : 0);
          if (d.currency) setCurrency(d.currency);
        }
      } catch {}
      setLoading(false);
    };
    load();

    const resize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
      candleRef.current = null;
      volRef.current = null;
    };
  }, [ticker]);

  // Live polling
  useEffect(() => {
    if (!live) return;
    const poll = async () => {
      try {
        const r = await fetch(`${API}/api/price/${ticker}`);
        const d = await r.json();
        if (d.error || !d.price) return;
        setPrice(d.price);
        setChangePct(d.change_pct);
        if (d.currency) setCurrency(d.currency);
        setPulse(true);
        setTimeout(() => setPulse(false), 500);
        if (candleRef.current) {
          const today = new Date(); today.setHours(0,0,0,0);
          const ts = Math.floor(today.getTime() / 1000) as any;
          candleRef.current.update({ time: ts, open: d.open, high: d.high, low: d.low, close: d.price });
        }
        if (volRef.current) {
          const today = new Date(); today.setHours(0,0,0,0);
          const ts = Math.floor(today.getTime() / 1000) as any;
          volRef.current.update({ time: ts, value: d.volume, color: d.price >= d.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' });
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, pollIntervalMs);
    return () => clearInterval(id);
  }, [live, ticker, pollIntervalMs]);

  const up = (changePct ?? 0) >= 0;

  return (
    <div
      onClick={() => onSelect?.(ticker)}
      className={`relative rounded-xl overflow-hidden border bg-[#0a0a0b] transition-all cursor-pointer ${
        selected ? 'border-purple-500/50 shadow-[0_0_12px_rgba(139,92,246,0.2)]' : 'border-white/8 hover:border-white/20'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white tracking-tight">{ticker}</span>
          {live && (
            <span className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${pulse ? 'opacity-100' : 'opacity-60'}`}>
              <span className={`w-1 h-1 rounded-full bg-emerald-400 ${pulse ? 'animate-ping' : 'animate-pulse'}`} />
              LIVE
            </span>
          )}
        </div>
        <div className="text-right">
          {price !== null && (
            <div className={`text-xs font-mono font-semibold transition-all ${up ? 'text-emerald-400' : 'text-red-400'} ${pulse ? 'scale-105' : ''}`}>
              {currency === 'INR' ? '₹' : '$'}{price.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2 })}
            </div>
          )}
          {currency === 'USD' && usdToInr && price !== null && (
            <div className="text-[9px] font-mono text-white/30">
              ≈ ₹{(price * usdToInr).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          )}
          {changePct !== null && (
            <div className={`text-[10px] font-mono ${up ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
              {up ? '+' : ''}{changePct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Chart — always mounted so the ref is available on first effect run */}
      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/80">
            <div className="w-4 h-4 border border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {selected && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-purple-500/60" />}
    </div>
  );
}
