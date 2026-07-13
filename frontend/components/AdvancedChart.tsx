'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';

interface OHLCData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumeData {
  time: string;
  value: number;
  color: string;
}

interface TradeMarker {
  time: string;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

interface AdvancedChartProps {
  data: OHLCData[];
  volumeData?: VolumeData[];
  markers?: TradeMarker[];
  height?: number;
  ticker?: string;
  live?: boolean;
  pollIntervalMs?: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Technical Calcs ──────────────────────────────────────────────────────────
function calculateSMA(data: any[], period: number) {
  const sma = [];
  for (let i = period; i <= data.length; i++) {
    const val = data.slice(i - period, i).reduce((sum, item) => sum + item.close, 0) / period;
    sma.push({ time: data[i - 1].time, value: val });
  }
  return sma;
}

function calculateEMA(data: any[], period: number) {
  const ema = [];
  const k = 2 / (period + 1);
  let prevEma = data[0].close;
  ema.push({ time: data[0].time, value: prevEma });
  for (let i = 1; i < data.length; i++) {
    prevEma = (data[i].close - prevEma) * k + prevEma;
    ema.push({ time: data[i].time, value: prevEma });
  }
  return ema;
}

function calculateBollingerBands(data: any[], period: number = 20, stdDevs: number = 2) {
  const upper = [];
  const lower = [];
  const middle = [];
  for (let i = period; i <= data.length; i++) {
    const slice = data.slice(i - period, i);
    const m = slice.reduce((sum, item) => sum + item.close, 0) / period;
    const sd = Math.sqrt(slice.reduce((sum, item) => sum + Math.pow(item.close - m, 2), 0) / period);
    middle.push({ time: data[i - 1].time, value: m });
    upper.push({ time: data[i - 1].time, value: m + stdDevs * sd });
    lower.push({ time: data[i - 1].time, value: m - stdDevs * sd });
  }
  return { upper, lower, middle };
}

function calculateMACD(data: any[]) {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const macdLine = [];
  for (let i = 0; i < ema12.length; i++) {
    const d12 = ema12[i];
    const d26 = ema26.find(d => d.time === d12.time);
    if (d12 && d26) {
      macdLine.push({ time: d12.time, value: d12.value - d26.value });
    }
  }
  const signalLine = calculateEMA(macdLine.map(m => ({ close: m.value, time: m.time })), 9);
  const histogram = macdLine.map((m, i) => {
    const sig = signalLine.find(s => s.time === m.time);
    const val = sig ? m.value - sig.value : 0;
    return { 
      time: m.time, 
      value: val,
      color: val >= 0 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)' 
    };
  });
  return { macdLine, signalLine, histogram };
}

function calculateRSI(data: OHLCData[], period: number = 14) {
  const rsiData = [];
  if (data.length <= period) return [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change; else losses += Math.abs(change);
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgGain / (avgLoss || 1);
    rsiData.push({ time: data[i].time, value: 100 - (100 / (1 + rs)) });
  }
  return rsiData;
}

export default function AdvancedChart({ data, volumeData, markers, height = 500, ticker = "STOCK", live = false, pollIntervalMs = 8000 }: AdvancedChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [legendData, setLegendData] = useState<any>({});
  const [livePulse, setLivePulse] = useState(false);
  const candleSeriesRef = useRef<any>(null);
  const volSeriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0b' },
        textColor: '#6b7280',
        fontSize: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(124, 58, 237, 0.3)', width: 1, style: 3, labelBackgroundColor: '#111827' },
        horzLine: { color: 'rgba(124, 58, 237, 0.3)', width: 1, style: 3, labelBackgroundColor: '#111827' },
      },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)', autoScale: true },
      timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)', rightOffset: 12, barSpacing: 6, timeVisible: true },
      width: chartContainerRef.current.clientWidth,
      height: height,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981', downColor: '#EF4444', borderVisible: false, wickUpColor: '#10B981', wickDownColor: '#EF4444',
    });
    candleSeriesRef.current = candlestickSeries;
    const sortedData = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    candlestickSeries.setData(sortedData);

    // ── Bollinger Bands ──────────────────────────────────────────────────────
    const bb = calculateBollingerBands(sortedData);
    const bbUpper = chart.addSeries(LineSeries, { color: 'rgba(59, 130, 246, 0.2)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const bbLower = chart.addSeries(LineSeries, { color: 'rgba(59, 130, 246, 0.2)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    bbUpper.setData(bb.upper);
    bbLower.setData(bb.lower);

    // ── Volume ───────────────────────────────────────────────────────────────
    const volumeSeries = chart.addSeries(HistogramSeries, { color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '' });
    volSeriesRef.current = volumeSeries;
    if (volumeData?.length) {
      volumeSeries.setData([...volumeData].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()));
    } else {
      volumeSeries.setData(sortedData.map(d => ({ 
        time: d.time, value: Math.random() * 1000000, 
        color: d.close >= d.open ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' 
      })));
    }
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    // ── MACD Pane ────────────────────────────────────────────────────────────
    const macd = calculateMACD(sortedData);
    const macdHistSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'macd', lastValueVisible: false });
    const macdLineSeries = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceScaleId: 'macd', lastValueVisible: false });
    const macdSigSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceScaleId: 'macd', lastValueVisible: false });
    
    macdHistSeries.setData(macd.histogram);
    macdLineSeries.setData(macd.macdLine);
    macdSigSeries.setData(macd.signalLine);
    
    chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.85, bottom: 0.05 }, borderColor: 'rgba(255, 255, 255, 0.05)' });

    // ── Markers ─────────────────────────────────────────────────────────────
    if (markers?.length) createSeriesMarkers(candlestickSeries, [...markers].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()));

    // ── RSI ────────────────────────────────────────────────────────────────
    const rsiSeries = chart.addSeries(LineSeries, { color: '#A78BFA', lineWidth: 1, priceScaleId: 'rsi', lastValueVisible: false });
    const rsiData = calculateRSI(sortedData);
    rsiSeries.setData(rsiData);
    chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.2 }, visible: false });

    // ── Legend Logic ───────────────────────────────────────────────────────
    chart.subscribeCrosshairMove(param => {
      const candle = param.seriesData.get(candlestickSeries) as any;
      const vol = param.seriesData.get(volumeSeries) as any;
      const mHist = param.seriesData.get(macdHistSeries) as any;
      const rsi = param.seriesData.get(rsiSeries) as any;

      if (!candle) {
        setLegendData({ close: sortedData[sortedData.length-1].close, color: 'text-emerald-400' });
        return;
      }
      setLegendData({
        ...candle, volume: vol?.value, rsi: rsi?.value, macd: mHist?.value,
        color: candle.close >= candle.open ? 'text-emerald-400' : 'text-red-400'
      });
    });

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, [data, volumeData, markers, height]);

  // Live polling
  useEffect(() => {
    if (!live || !ticker) return;

    const fetchLive = async () => {
      try {
        const r = await fetch(`${API}/api/price/${ticker}`);
        const d = await r.json();
        if (d.error || !d.price) return;

        setLivePulse(true);
        setTimeout(() => setLivePulse(false), 500);

        if (candleSeriesRef.current) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const ts = Math.floor(today.getTime() / 1000) as any;
          candleSeriesRef.current.update({
            time: ts,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.price,
          });
        }
        if (volSeriesRef.current) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const ts = Math.floor(today.getTime() / 1000) as any;
          volSeriesRef.current.update({
            time: ts,
            value: d.volume,
            color: d.price >= d.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
          });
        }
        setLegendData((prev: any) => ({
          ...prev,
          open: d.open, high: d.high, low: d.low, close: d.price,
          volume: d.volume,
          color: d.price >= d.open ? 'text-emerald-400' : 'text-red-400',
        }));
      } catch {}
    };

    fetchLive();
    const id = setInterval(fetchLive, pollIntervalMs);
    return () => clearInterval(id);
  }, [live, ticker, pollIntervalMs]);

  return (
    <div className="flex flex-col w-full h-full relative group bg-[#0a0a0b] rounded-xl overflow-hidden border border-white/5">
      {/* HUD Legend */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {live ? (
            <div className={`flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 rounded px-1.5 py-0.5 text-[10px] text-emerald-400 font-black uppercase tracking-tighter transition-all ${livePulse ? 'scale-110 bg-emerald-500/30' : ''}`}>
              <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${livePulse ? 'animate-ping' : 'animate-pulse'}`} />
              LIVE
            </div>
          ) : (
            <div className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] text-white/40 font-black uppercase tracking-tighter">HIST</div>
          )}
          <span className="text-white font-bold text-base tracking-tight">{ticker}</span>
        </div>
        <div className="flex gap-4 text-[11px] font-mono mt-1">
          {['open', 'high', 'low', 'close'].map(k => (
            <div key={k} className="flex gap-1.5"><span className="text-white/20 uppercase">{k[0]}</span><span className={legendData.color}>{legendData[k]?.toFixed(2) || '0.00'}</span></div>
          ))}
          <div className="flex gap-1.5 ml-4 border-l border-white/10 pl-4"><span className="text-white/20">VOL</span><span className="text-white/60">{(legendData.volume || 0).toLocaleString()}</span></div>
        </div>
        <div className="flex gap-4 text-[9px] font-bold uppercase tracking-widest mt-2">
            <span className="text-purple-400/60">RSI (14): {legendData.rsi?.toFixed(2) || '--'}</span>
            <span className="text-blue-400/60">MACD: {legendData.macd?.toFixed(2) || '--'}</span>
            <span className="text-white/10">Bollinger: ACTIVE</span>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full relative flex-1" />
      
      {/* Visual Polish: Side Vignettes */}
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />
    </div>
  );
}

