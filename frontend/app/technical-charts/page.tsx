'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AdvancedChart from '@/components/AdvancedChart';
import MiniChart from '@/components/MiniChart';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const PRESET_TICKERS = [
  { label: 'NIFTY 50',   sym: 'NIFTY50',    flag: '🇮🇳' },
  { label: 'SENSEX',     sym: 'SENSEX',      flag: '🇮🇳' },
  { label: 'RELIANCE',   sym: 'RELIANCE',    flag: '🇮🇳' },
  { label: 'TCS',        sym: 'TCS',         flag: '🇮🇳' },
  { label: 'HDFCBANK',   sym: 'HDFCBANK',    flag: '🇮🇳' },
  { label: 'INFY',       sym: 'INFY',        flag: '🇮🇳' },
  { label: 'AAPL',       sym: 'AAPL',        flag: '🇺🇸' },
  { label: 'MSFT',       sym: 'MSFT',        flag: '🇺🇸' },
  { label: 'NVDA',       sym: 'NVDA',        flag: '🇺🇸' },
  { label: 'TSLA',       sym: 'TSLA',        flag: '🇺🇸' },
];

const PERIODS = [
  { label: '1W', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
];

const WATCH_TICKERS = ['RELIANCE', 'TCS', 'HDFCBANK', 'AAPL', 'MSFT'];

interface OHLCBar { time: string; open: number; high: number; low: number; close: number; }
interface LiveQuote { price: number; open: number; high: number; low: number; change_pct: number; volume: number; currency?: string; }

function fmt(val: number, currency: string) {
  if (currency === 'INR') return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

export default function TechnicalChartsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [activeTicker, setActiveTicker] = useState('RELIANCE');
  const [period, setPeriod] = useState('3mo');
  const [ohlcData, setOhlcData] = useState<OHLCBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null);
  const [currency, setCurrency] = useState<string>('INR');
  const [watchData, setWatchData] = useState<Record<string, { data: any[]; name: string }>>({});
  const [watchQuotes, setWatchQuotes] = useState<Record<string, LiveQuote & { currency?: string }>>({});

  // USD↔INR converter state
  const [usdToInr, setUsdToInr] = useState<number>(83.5);
  const [rateLoading, setRateLoading] = useState(false);
  const [converterAmount, setConverterAmount] = useState<string>('1');
  const [converterDir, setConverterDir] = useState<'usd-to-inr' | 'inr-to-usd'>('usd-to-inr');

  // Fetch live USD/INR rate
  const fetchRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const r = await fetch(`${API}/api/forex/usd-inr`);
      const d = await r.json();
      if (d.rate) setUsdToInr(d.rate);
    } catch {}
    setRateLoading(false);
  }, []);

  // Fetch OHLC history for main chart
  const fetchHistory = useCallback(async (sym: string, per: string) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/history/${sym}?period=${per}`);
      const d = await r.json();
      if (d.history) {
        setOhlcData(d.history.map((h: any) => ({
          time: h.date, open: h.open, high: h.high, low: h.low, close: h.close,
        })));
        if (d.currency) setCurrency(d.currency);
      }
    } catch {}
    setLoading(false);
  }, []);

  // Fetch live quote for main chart ticker
  const fetchQuote = useCallback(async (sym: string) => {
    try {
      const r = await fetch(`${API}/api/price/${sym}`);
      const d = await r.json();
      if (!d.error) {
        setLiveQuote(d);
        if (d.currency) setCurrency(d.currency);
      }
    } catch {}
  }, []);

  // Fetch mini-chart history for watchlist
  const fetchWatchHistory = useCallback(async () => {
    const results: Record<string, { data: any[]; name: string }> = {};
    await Promise.all(WATCH_TICKERS.map(async (sym) => {
      try {
        const r = await fetch(`${API}/api/history/${sym}?period=1mo`);
        const d = await r.json();
        if (d.history) {
          results[sym] = { name: sym, data: d.history.map((h: any) => ({ time: h.date, value: h.close, volume: h.volume })) };
        }
      } catch {}
    }));
    setWatchData(results);
  }, []);

  const fetchWatchQuotes = useCallback(async () => {
    const quotes: Record<string, any> = {};
    await Promise.all(WATCH_TICKERS.map(async (sym) => {
      try {
        const r = await fetch(`${API}/api/price/${sym}`);
        const d = await r.json();
        if (!d.error) quotes[sym] = d;
      } catch {}
    }));
    setWatchQuotes(quotes);
  }, []);

  useEffect(() => {
    fetchHistory(activeTicker, period);
    fetchQuote(activeTicker);
  }, [activeTicker, period]);

  useEffect(() => {
    fetchWatchHistory();
    fetchWatchQuotes();
    fetchRate();
    const quoteId = setInterval(fetchWatchQuotes, 10000);
    const rateId  = setInterval(fetchRate, 60000); // refresh rate every minute
    return () => { clearInterval(quoteId); clearInterval(rateId); };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) { setActiveTicker(searchInput.trim().toUpperCase()); setSearchInput(''); }
  };

  const changePct = liveQuote?.change_pct ?? 0;

  const converterResult = () => {
    const amt = parseFloat(converterAmount) || 0;
    if (converterDir === 'usd-to-inr') return (amt * usdToInr).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return (amt / usdToInr).toLocaleString('en-US', { maximumFractionDigits: 4 });
  };

  return (
    <main className="min-h-screen bg-black text-white pt-24 pb-20 px-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/60 font-medium tracking-wide uppercase">Live Technical Charts</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-medium tracking-tighter text-white">Market Charts</h1>
            <p className="text-white/40 mt-1 text-sm">Real-time OHLC · Bollinger Bands · MACD · RSI · INR & USD</p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text" value={searchInput}
              onChange={e => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Ticker (e.g. WIPRO or GOOGL)"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-purple-500/50 w-60"
            />
            <button type="submit" className="px-4 py-2.5 bg-purple-600/80 hover:bg-purple-600 rounded-xl text-sm font-semibold transition-colors">Load</button>
          </form>
        </div>

        {/* USD/INR Converter + Rate bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Rate badge */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02] min-w-fit">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🇺🇸</span>
              <span className="text-xs font-bold text-white/60">USD</span>
            </div>
            <span className="text-white/30 text-sm">=</span>
            <div className="flex items-center gap-1.5">
              <span className="text-base">🇮🇳</span>
              <span className="text-sm font-mono font-bold text-emerald-400">₹{usdToInr.toFixed(2)}</span>
            </div>
            {rateLoading && <div className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />}
          </div>

          {/* Converter */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/8 bg-white/[0.02] flex-1">
            <span className="text-[11px] text-white/40 uppercase tracking-widest whitespace-nowrap">Convert</span>
            <input
              type="number" min="0" value={converterAmount}
              onChange={e => setConverterAmount(e.target.value)}
              className="w-28 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-purple-500/40"
            />
            <button
              onClick={() => setConverterDir(d => d === 'usd-to-inr' ? 'inr-to-usd' : 'usd-to-inr')}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-white/60 transition-colors whitespace-nowrap"
            >
              {converterDir === 'usd-to-inr' ? 'USD → INR' : 'INR → USD'}
            </button>
            <span className="text-white/20">=</span>
            <span className="font-mono text-sm font-semibold text-white">
              {converterDir === 'usd-to-inr' ? '₹' : '$'}{converterResult()}
            </span>
          </div>
        </div>

        {/* Preset tickers */}
        <div className="flex flex-wrap gap-2 mb-6">
          {PRESET_TICKERS.map(t => (
            <button key={t.sym} onClick={() => setActiveTicker(t.sym)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                activeTicker === t.sym
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                  : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <span>{t.flag}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Main chart area */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden mb-8">
          {/* Chart top bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-white/8">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-lg font-bold text-white tracking-tight">{activeTicker}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${currency === 'INR' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20'}`}>
                {currency === 'INR' ? '🇮🇳 INR' : '🇺🇸 USD'}
              </span>
              {liveQuote && (
                <>
                  <span className="text-2xl font-mono font-semibold text-white">
                    {fmt(liveQuote.price, currency)}
                  </span>
                  {currency === 'USD' && (
                    <span className="text-sm font-mono text-white/30">
                      ≈ ₹{(liveQuote.price * usdToInr).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  )}
                  <span className={`text-sm font-semibold font-mono ${changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                  </span>
                </>
              )}
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />LIVE
              </span>
            </div>
            <div className="flex gap-1 bg-white/[0.04] border border-white/8 rounded-xl p-1">
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p.value ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* OHLC stats row */}
          {liveQuote && (
            <div className="flex flex-wrap gap-6 px-5 py-3 border-b border-white/5 bg-white/[0.01]">
              {[
                { label: 'Open',  val: liveQuote.open  },
                { label: 'High',  val: liveQuote.high  },
                { label: 'Low',   val: liveQuote.low   },
                { label: 'Close', val: liveQuote.price },
              ].map(({ label, val }) => (
                <div key={label} className="flex gap-2 items-baseline">
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">{label}</span>
                  <span className="text-sm font-mono text-white/80">{fmt(val, currency)}</span>
                  {currency === 'USD' && (
                    <span className="text-[10px] font-mono text-white/25">≈₹{(val * usdToInr).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  )}
                </div>
              ))}
              <div className="flex gap-2 items-baseline ml-auto">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Volume</span>
                <span className="text-sm font-mono text-white/60">{liveQuote.volume.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center h-[500px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-purple-500/50 border-t-purple-400 rounded-full animate-spin" />
                  <span className="text-white/30 text-sm">Loading chart data…</span>
                </div>
              </div>
            ) : ohlcData.length > 0 ? (
              <AdvancedChart data={ohlcData} ticker={activeTicker} height={500} live pollIntervalMs={8000} />
            ) : (
              <div className="flex items-center justify-center h-[500px] text-white/30 text-sm">
                No data for <span className="text-white/60 ml-1 font-mono">{activeTicker}</span>
              </div>
            )}
          </div>
        </div>

        {/* Watchlist */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">Watchlist — Live</h2>
          <span className="text-[10px] text-white/25">🇮🇳 INR &nbsp;·&nbsp; 🇺🇸 USD &nbsp;·&nbsp; Updates every 10s</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {WATCH_TICKERS.map(sym => {
            const wd  = watchData[sym];
            const q   = watchQuotes[sym];
            const cur = q?.currency || 'INR';
            return (
              <div key={sym} onClick={() => setActiveTicker(sym)}
                className={`cursor-pointer transition-all rounded-xl ${activeTicker === sym ? 'ring-1 ring-purple-500/50' : 'hover:ring-1 hover:ring-white/10'}`}>
                {wd ? (
                  <MiniChart ticker={sym} name={sym} data={wd.data} height={160} live pollIntervalMs={10000} />
                ) : (
                  <div className="h-40 rounded-xl bg-white/[0.02] border border-white/8 flex items-center justify-center">
                    <div className="w-5 h-5 border border-white/20 border-t-white/60 rounded-full animate-spin" />
                  </div>
                )}
                {q && (
                  <div className="flex justify-between px-3 py-1.5 bg-white/[0.02] rounded-b-xl border border-t-0 border-white/5">
                    <span className="text-[11px] font-mono text-white/60">
                      {cur === 'INR' ? '🇮🇳' : '🇺🇸'} {fmt(q.price, cur)}
                    </span>
                    <span className={`text-[11px] font-mono font-semibold ${q.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {q.change_pct >= 0 ? '+' : ''}{q.change_pct.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </main>
  );
}
