'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ShinyText from '@/components/reactbits/ShinyText';
import GradientText from '@/components/reactbits/GradientText';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import StarBorder from '@/components/reactbits/StarBorder';
import AdvancedChart from '@/components/AdvancedChart';
import EquityChart from '@/components/EquityChart';
import PerformanceTable from '@/components/PerformanceTable';
import MonthlyReturnsHeatmap from '@/components/MonthlyReturnsHeatmap';
import DrawdownChart from '@/components/DrawdownChart';
import MiniChart from '@/components/MiniChart';
import CandleMiniChart from '@/components/CandleMiniChart';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalystInfo { label: string; description: string; icon: string; }
interface PersonaInfo { label: string; style: string; color: string; }
interface ProviderInfo { label: string; models: string[]; }

interface AnalystSignal {
  agent_id: string; ticker: string; signal: string;
  confidence: number; reasoning: string;
}
interface RiskSignal {
  ticker: string; signal: string; confidence: number; max_position_size: number;
}
interface PortfolioPosition {
  ticker: string; action: string; quantity: number; confidence: number; reasoning: string;
}
interface AnalysisResult {
  tickers: string[];
  analyst_signals: Record<string, AnalystSignal[]>;
  risk_adjusted_signals: RiskSignal[];
  portfolio_output: { positions: PortfolioPosition[]; cash_remaining: number; total_value: number };
  timestamp: string;
}
interface PaperPortfolio {
  cash: number; total_value: number;
  positions: Record<string, { shares: number; avg_cost: number; current_price: number }>;
  trades: any[];
  last_run: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const ANALYST_ICONS: Record<string, string> = {
  fundamentals: 'solar:chart-square-linear',
  technical: 'solar:graph-up-linear',
  sentiment: 'solar:document-text-linear',
  valuation: 'solar:calculator-linear',
  growth: 'solar:rocket-linear',
  macro_regime: 'solar:globe-linear',
};

const PERSONA_COLORS: Record<string, string> = {
  buffett: '#3b82f6', graham: '#8b5cf6', munger: '#6366f1', burry: '#ef4444',
  wood: '#f59e0b', ackman: '#10b981', lynch: '#14b8a6', damodaran: '#6d28d9',
  druckenmiller: '#dc2626', fisher: '#0891b2', pabrai: '#7c3aed', jhunjhunwala: '#059669',
};

const SIGNAL_STYLES: Record<string, string> = {
  bullish: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  bearish: 'text-red-400 bg-red-500/10 border-red-500/30',
  neutral: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
};

const ACTION_STYLES: Record<string, string> = {
  buy: 'text-emerald-400 bg-emerald-500/10',
  sell: 'text-red-400 bg-red-500/10',
  hold: 'text-amber-400 bg-amber-500/10',
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: string }) {
  const s = signal?.toLowerCase() || 'neutral';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${SIGNAL_STYLES[s] || SIGNAL_STYLES.neutral}`}>
      {s === 'bullish' ? '▲' : s === 'bearish' ? '▼' : '—'} {s}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 65 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-white/50 w-8 text-right">{value}%</span>
    </div>
  );
}

function StatusChip({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${online ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
      {online ? 'Backend Online' : 'Backend Offline'}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HedgeFundPage() {
  const [activeTab, setActiveTab] = useState<'analyze' | 'backtest' | 'paper' | 'risk' | 'notifications'>('analyze');
  const [backendOnline, setBackendOnline] = useState(false);

  // Metadata from backend
  const [analysts, setAnalysts] = useState<Record<string, AnalystInfo>>({});
  const [personas, setPersonas] = useState<Record<string, PersonaInfo>>({});
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});

  // ── Analysis state ──────────────────────────────────────────────────────────
  const [tickers, setTickers] = useState('AAPL,MSFT');
  const [useLLM, setUseLLM] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('groq');
  const [selectedModel, setSelectedModel] = useState('llama3-70b-8192');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  // ── Backtest state ──────────────────────────────────────────────────────────
  const [btTickers, setBtTickers] = useState('AAPL,MSFT');
  const [btStartDate, setBtStartDate] = useState('2024-01-01');
  const [btEndDate, setBtEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [btCash, setBtCash] = useState(100000);
  const [btStopLoss, setBtStopLoss] = useState<number | ''>('');
  const [btTrailingStop, setBtTrailingStop] = useState<number | ''>('');
  const [btTakeProfit, setBtTakeProfit] = useState<number | ''>('');
  const [btFrequency, setBtFrequency] = useState('weekly');
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [btResult, setBtResult] = useState<any>(null);
  const [btEquityData, setBtEquityData] = useState<any[]>([]);
  const [btResultsTab, setBtResultsTab] = useState<'overview' | 'stats' | 'analysis' | 'trades'>('overview');

  // ── Paper trading state ─────────────────────────────────────────────────────
  const [paperPortfolio, setPaperPortfolio] = useState<PaperPortfolio | null>(null);
  const [ptTickers, setPtTickers] = useState('AAPL,MSFT,NVDA');
  const [ptCash, setPtCash] = useState(100000);
  const [ptLoading, setPtLoading] = useState(false);
  const [ptError, setPtError] = useState('');
  const [activePaperTicker, setActivePaperTicker] = useState<string>('');
  const [paperChartData, setPaperChartData] = useState<{ ohlc: any[]; volume: any[]; markers: any[] }>({ ohlc: [], volume: [], markers: [] });
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const ptLoadingRef = useRef(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  // ── FX rate ─────────────────────────────────────────────────────────────────
  const [usdToInr, setUsdToInr] = useState(83.5);

  // ── Notifications state ─────────────────────────────────────────────────────
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestInterval, setDigestInterval] = useState(6);
  const [notifConfigured, setNotifConfigured] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [digestSending, setDigestSending] = useState(false);

  const fetchNotifStatus = async () => {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/notifications/status`);
      const d = await r.json();
      setNotifConfigured(d.telegram_configured);
      setDigestEnabled(d.digest?.enabled ?? false);
      setDigestInterval(d.digest?.interval_hours ?? 6);
    } catch {}
  };

  const saveNotifConfig = async () => {
    setNotifLoading(true);
    setNotifMsg(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const r = await fetch(`${base}/api/notifications/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: digestEnabled,
          interval_hours: digestInterval,
          telegram_bot_token: tgBotToken || undefined,
          telegram_chat_id: tgChatId || undefined,
        }),
      });
      const d = await r.json();
      setNotifConfigured(d.telegram_configured);
      setNotifMsg({ text: 'Configuration saved.', ok: true });
    } catch (e) {
      setNotifMsg({ text: 'Failed to save config.', ok: false });
    } finally {
      setNotifLoading(false);
    }
  };

  const sendTestTelegram = async () => {
    setNotifLoading(true);
    setNotifMsg(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const r = await fetch(`${base}/api/notifications/test`, { method: 'POST' });
      const d = await r.json();
      setNotifMsg({ text: d.message, ok: d.success });
    } catch {
      setNotifMsg({ text: 'Request failed.', ok: false });
    } finally {
      setNotifLoading(false);
    }
  };

  const sendDigestNow = async () => {
    setDigestSending(true);
    setNotifMsg(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const r = await fetch(`${base}/api/notifications/send-digest`, { method: 'POST' });
      const d = await r.json();
      setNotifMsg({ text: d.message, ok: d.success });
      addLog(`Telegram digest: ${d.success ? 'sent' : 'failed'}`);
    } catch {
      setNotifMsg({ text: 'Request failed.', ok: false });
    } finally {
      setDigestSending(false);
    }
  };

  const addLog = (msg: string) => {
    setTerminalLogs(prev => [
      `[${new Date().toLocaleTimeString('en-GB')}] ${msg}`,
      ...prev.slice(0, 49)
    ]);
  };

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    checkBackend();
    fetchPaperPortfolio();
    fetchNotifStatus();
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/forex/usd-inr`)
      .then(r => r.json()).then(d => { if (d.rate) setUsdToInr(d.rate); }).catch(() => {});
    addLog("System Initialized. Await Signal.");
  }, []);


  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoTrading) {
      interval = setInterval(() => {
        if (!ptLoadingRef.current) runPaperTrade();
      }, 10000); // 10s auto cycle
    }
    return () => clearInterval(interval);
  }, [isAutoTrading /* intentionally loose dependencies to prevent constant reset */]);

  useEffect(() => {
    if (activePaperTicker) fetchHistoryForPaperChart(activePaperTicker);
  }, [activePaperTicker, paperPortfolio?.trades]); // Re-fetch if trades change to update markers

  useEffect(() => {
    if (btResult?.results?.snapshots) {
      setBtEquityData(btResult.results.snapshots.map((s: any) => ({
        time: s.date,
        value: s.total_value,
      })));
    } else {
      setBtEquityData([]);
    }
  }, [btResult]);

  const checkBackend = async () => {
    try {
      const [analystsRes, personasRes, providersRes] = await Promise.all([
        fetch('/api/hedge-fund/analysts'),
        fetch('/api/hedge-fund/personas'),
        fetch('/api/hedge-fund/providers'),
      ]);
      setBackendOnline(analystsRes.ok);
      if (analystsRes.ok) setAnalysts((await analystsRes.json()).analysts || {});
      if (personasRes.ok) setPersonas((await personasRes.json()).personas || {});
      if (providersRes.ok) {
        const pd = await providersRes.json();
        setProviders(pd.providers || pd.all_providers || {});
      }
    } catch {
      setBackendOnline(false);
    }
  };

  const fetchPaperPortfolio = async () => {
    try {
      const res = await fetch('/api/hedge-fund/paper-portfolio');
      if (res.ok) {
        const data = await res.json();
        setPaperPortfolio(data);
        if (!activePaperTicker && Object.keys(data.positions || {}).length > 0) {
          setActivePaperTicker(Object.keys(data.positions)[0]);
        }
      }
    } catch { }
  };

  const fetchHistoryForPaperChart = async (ticker: string) => {
    try {
      const r = await fetch(`/api/history/${encodeURIComponent(ticker)}?period=6mo`);
      const d = await r.json();
      if (d.history) {
        const ohlc = d.history.map((h: any) => ({
          time: h.date, open: h.open, high: h.high, low: h.low, close: h.close
        }));
        const vol = d.history.map((h: any) => ({
          time: h.date, value: h.volume, color: h.close > h.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
        }));
        
        // Match paper trades to markers
        const tradeMarkers: any[] = [];
        if (paperPortfolio?.trades) {
          paperPortfolio.trades.forEach((t: any) => {
            if (t.ticker === ticker) {
              const dtDate = t.date?.split('T')[0] || t.timestamp?.split('T')[0] || new Date().toISOString().split('T')[0];
              tradeMarkers.push({
                time: dtDate,
                position: t.action === 'BUY' ? 'belowBar' : 'aboveBar',
                color: t.action === 'BUY' ? '#10b981' : '#ef4444',
                shape: t.action === 'BUY' ? 'arrowUp' : 'arrowDown',
                text: `${t.action} @ ${t.price?.toFixed(2)}`,
              });
            }
          });
        }
        setPaperChartData({ ohlc, volume: vol, markers: tradeMarkers });
      }
    } catch (e) { console.error('Error fetching chart data', e); }
  };

  // ── Analysis ────────────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError('');
    setAnalysisResult(null);
    try {
      const res = await fetch('/api/hedge-fund/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean),
          use_llm: useLLM,
          personas: selectedPersonas.length > 0 ? selectedPersonas : null,
          model_provider: selectedProvider,
          model_name: selectedModel,
          show_reasoning: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysisResult(data);
    } catch (e: any) {
      setAnalysisError(e.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // ── Backtest ────────────────────────────────────────────────────────────────
  const runBacktest = async () => {
    setBtLoading(true);
    setBtError('');
    setBtResult(null);
    try {
      const res = await fetch('/api/hedge-fund/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: btTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean),
          start_date: btStartDate,
          end_date: btEndDate,
          cash: btCash,
          stop_loss: btStopLoss !== '' ? Number(btStopLoss) / 100 : null,
          trailing_stop: btTrailingStop !== '' ? Number(btTrailingStop) / 100 : null,
          take_profit: btTakeProfit !== '' ? Number(btTakeProfit) / 100 : null,
          frequency: btFrequency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backtest failed');
      setBtResult(data);
    } catch (e: any) {
      setBtError(e.message);
    } finally {
      setBtLoading(false);
    }
  };

  // ── Paper Trading ───────────────────────────────────────────────────────────
  const runPaperTrade = async () => {
    ptLoadingRef.current = true;
    setPtLoading(true);
    setPtError('');
    try {
      const res = await fetch('/api/hedge-fund/paper-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: ptTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean),
          use_llm: useLLM,
          model_provider: selectedProvider,
          model_name: selectedModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');
      setPaperPortfolio(data.portfolio);
      
      if (!activePaperTicker && Object.keys(data.portfolio?.positions || {}).length > 0) {
        setActivePaperTicker(Object.keys(data.portfolio.positions)[0]);
      } else if (activePaperTicker) {
        fetchHistoryForPaperChart(activePaperTicker); // Refetch chart with new markers
      }
    } catch (e: any) {
      setPtError(e.message);
    } finally {
      ptLoadingRef.current = false;
      setPtLoading(false);
    }
  };

  const resetPaperPortfolio = async () => {
    setPtLoading(true);
    setPtError('');
    try {
      const res = await fetch('/api/hedge-fund/paper-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _action: 'reset',
          cash: ptCash,
          tickers: ptTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setPaperPortfolio(data.portfolio);
    } catch (e: any) {
      setPtError(e.message);
    } finally {
      setPtLoading(false);
    }
  };

  const togglePersona = (key: string) => {
    setSelectedPersonas(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'analyze', label: 'Multi-Agent Analysis', icon: 'solar:users-group-two-rounded-linear' },
    { id: 'backtest', label: 'Backtesting', icon: 'solar:graph-up-linear' },
    { id: 'paper', label: 'Paper Trading', icon: 'solar:wallet-linear' },
    { id: 'risk', label: 'Risk Monitor', icon: 'solar:shield-warning-linear' },
    { id: 'notifications', label: 'Telegram Alerts', icon: 'solar:bell-linear' },
  ] as const;

  return (
    <main className="min-h-screen w-full bg-black text-white relative overflow-hidden">
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-20">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <ShinyText text="AI HEDGE FUND ENGINE" speed={3} color="#a78bfa" shineColor="#fff" className="text-[10px] tracking-wide font-medium" />
            </div>
            <h1 className="text-3xl md:text-5xl font-medium tracking-tighter">
              <GradientText colors={['#5227FF', '#a78bfa', '#4f8fff', '#5227FF']} animationSpeed={4}>
                Stratton Oakmont
              </GradientText>
            </h1>
            <p className="text-white/40 mt-2 text-sm max-w-lg">
              6 core analysts · 12 investor personas · real-time signals · backtesting · paper trading
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusChip online={backendOnline} />
            {!backendOnline && (
              <p className="text-[10px] text-white/30 text-right max-w-xs">
                Start: <code className="text-purple-400">cd backend && uvicorn app.main:app --port 8000</code>
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-white/[0.03] border border-white/10 rounded-2xl p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === tab.id ? 'bg-white/10 text-white shadow-md' : 'text-white/40 hover:text-white/70'}`}
            >
              <iconify-icon icon={tab.icon} width="16" />
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB: Multi-Agent Analysis ───────────────────────────────────────── */}
        {activeTab === 'analyze' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Config */}
            <div className="lg:col-span-1 space-y-5">
              {/* Tickers */}
              <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(82,39,255,0.15)">
                <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <iconify-icon icon="solar:chart-2-linear" className="text-purple-400" />
                  Tickers
                </h3>
                <input
                  value={tickers}
                  onChange={e => setTickers(e.target.value)}
                  placeholder="AAPL,MSFT,NVDA"
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
                />
                <p className="text-[10px] text-white/30 mt-2">Comma-separated (e.g. AAPL,MSFT,NVDA)</p>
              </SpotlightCard>

              {/* LLM Toggle */}
              <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(82,39,255,0.1)">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <iconify-icon icon="solar:stars-minimalistic-bold" className="text-amber-400" />
                    LLM Reasoning
                  </h3>
                  <button
                    onClick={() => setUseLLM(!useLLM)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${useLLM ? 'bg-purple-600' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${useLLM ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {useLLM && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Provider</label>
                      <select
                        value={selectedProvider}
                        onChange={e => {
                          setSelectedProvider(e.target.value);
                          const p = providers[e.target.value];
                          if (p?.models?.length) setSelectedModel(p.models[0]);
                        }}
                        className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                      >
                        {Object.entries(providers).map(([key, p]) => (
                          <option key={key} value={key}>{p.label || key}</option>
                        ))}
                        {Object.keys(providers).length === 0 && <option value="groq">Groq</option>}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Model</label>
                      <select
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                      >
                        {(providers[selectedProvider]?.models || ['llama3-70b-8192']).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </SpotlightCard>

              {/* Investor Personas */}
              <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(82,39,255,0.1)">
                <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <iconify-icon icon="solar:users-group-two-rounded-linear" className="text-blue-400" />
                  Investor Personas
                  <span className="text-[10px] text-white/30">(requires LLM)</span>
                </h3>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto scrollbar-hide">
                  {Object.entries(personas).length > 0
                    ? Object.entries(personas).map(([key, p]) => (
                      <button
                        key={key}
                        onClick={() => togglePersona(key)}
                        disabled={!useLLM}
                        style={{ borderColor: selectedPersonas.includes(key) ? (PERSONA_COLORS[key] || '#5227FF') : 'transparent' }}
                        className={`text-left p-2.5 rounded-xl border text-xs transition-all ${selectedPersonas.includes(key) ? 'bg-white/10' : 'bg-white/[0.03] hover:bg-white/[0.06]'} ${!useLLM ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="font-medium text-white truncate">{p.label}</div>
                        <div className="text-white/30 text-[9px] truncate mt-0.5">{p.style}</div>
                      </button>
                    ))
                    : Object.entries(PERSONA_COLORS).map(([key, color]) => (
                      <button
                        key={key}
                        onClick={() => togglePersona(key)}
                        disabled={!useLLM}
                        style={{ borderColor: selectedPersonas.includes(key) ? color : 'transparent' }}
                        className={`text-left p-2.5 rounded-xl border text-xs transition-all ${selectedPersonas.includes(key) ? 'bg-white/10' : 'bg-white/[0.03] hover:bg-white/[0.06]'} ${!useLLM ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="font-medium text-white capitalize">{key}</div>
                      </button>
                    ))
                  }
                </div>
                {selectedPersonas.length > 0 && (
                  <div className="mt-3 flex gap-1 flex-wrap">
                    <button onClick={() => setSelectedPersonas(Object.keys(personas))} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">Select All</button>
                    <button onClick={() => setSelectedPersonas([])} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40">Clear</button>
                  </div>
                )}
              </SpotlightCard>

              {/* Run Button */}
              <StarBorder as="button" onClick={runAnalysis} disabled={analysisLoading || !tickers.trim()} color="#5227FF" speed="4s"
                className={`w-full ${analysisLoading || !tickers.trim() ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <span className="flex items-center justify-center gap-2">
                  {analysisLoading ? (
                    <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Running Agents...</>
                  ) : (
                    <><iconify-icon icon="solar:stars-minimalistic-bold" width="18" />Run Analysis</>
                  )}
                </span>
              </StarBorder>
            </div>

            {/* Right: Results */}
            <div className="lg:col-span-2 space-y-5">
              {analysisError && (
                <div className="glass-panel rounded-2xl p-5 border border-red-500/20 bg-red-500/5">
                  <div className="flex items-start gap-3">
                    <iconify-icon icon="solar:danger-triangle-linear" className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-300">{analysisError}</p>
                  </div>
                </div>
              )}

              {!analysisResult && !analysisLoading && !analysisError && (
                <div className="glass-panel rounded-2xl p-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                    <iconify-icon icon="solar:chart-square-linear" width="34" className="text-white/30" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">Ready to Analyze</h3>
                  <p className="text-sm text-white/30">Configure tickers and click "Run Analysis"</p>
                </div>
              )}

              {analysisLoading && (
                <div className="glass-panel rounded-2xl p-10 text-center">
                  <div className="w-16 h-16 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin mx-auto mb-6" />
                  <h3 className="text-lg font-medium text-white mb-2">Agents Running</h3>
                  <p className="text-sm text-white/30">Analysts processing {tickers} in parallel…</p>
                  <div className="flex justify-center gap-3 mt-4 flex-wrap">
                    {Object.keys(analysts).length > 0
                      ? Object.entries(analysts).map(([key, a]) => (
                          <span key={key} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 animate-pulse">{a.label}</span>
                        ))
                      : null}
                  </div>
                </div>
              )}

              {analysisResult && (
                <>
                  {/* Analyst Signals */}
                  <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(82,39,255,0.1)">
                    <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                      <iconify-icon icon="solar:users-group-two-rounded-linear" className="text-purple-400" />
                      Analyst Signals
                      <span className="text-[10px] text-white/40 ml-auto">{analysisResult.timestamp ? new Date(analysisResult.timestamp).toLocaleTimeString() : ''}</span>
                    </h3>
                    <div className="overflow-x-auto -mx-1 px-1">
                      <table className="w-full text-sm border-separate border-spacing-0">
                        <thead>
                          <tr className="bg-white/[0.02]">
                            <th className="text-left text-[9px] text-white/30 uppercase tracking-[0.2em] py-3 px-4 border-y border-white/5 rounded-l-lg font-bold">Analyst Entity</th>
                            <th className="text-left text-[9px] text-white/30 uppercase tracking-[0.2em] py-3 px-4 border-y border-white/5 font-bold">Ticker</th>
                            <th className="text-left text-[9px] text-white/30 uppercase tracking-[0.2em] py-3 px-4 border-y border-white/5 font-bold">Strategic Signal</th>
                            <th className="text-left text-[9px] text-white/30 uppercase tracking-[0.2em] py-3 px-4 border-y border-white/5 font-bold w-40">Confidence Interval</th>
                            <th className="text-left text-[9px] text-white/30 uppercase tracking-[0.2em] py-3 px-4 border-y border-white/5 rounded-r-lg font-bold">Institutional Reasoning</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                          {Object.entries(analysisResult.analyst_signals).flatMap(([agentId, signals]) =>
                            (signals as AnalystSignal[]).map((sig, i) => (
                              <tr key={`${agentId}-${i}`} className="hover:bg-white/[0.03] transition-all group">
                                <td className="py-4 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-500/40 group-hover:bg-purple-400 group-hover:scale-125 transition-all shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
                                    <span className="text-[11px] text-white font-semibold tracking-tight">{agentId.replace('_analyst', '').replace(/_/g, ' ').toUpperCase()}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 font-mono text-white font-bold">{sig.ticker}</td>
                                <td className="py-4 px-4"><SignalBadge signal={sig.signal} /></td>
                                <td className="py-4 px-4 w-40"><ConfidenceBar value={sig.confidence} /></td>
                                <td className="py-4 px-4 text-[11px] text-white/40 max-w-xs truncate leading-relaxed group-hover:text-white/70 transition-colors italic">"{sig.reasoning}"</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </SpotlightCard>

                  {/* Risk-Adjusted Signals */}
                  {analysisResult.risk_adjusted_signals?.length > 0 && (
                    <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(251,191,36,0.08)">
                      <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                        <iconify-icon icon="solar:shield-warning-linear" className="text-amber-400" />
                        Risk-Adjusted Signals
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {analysisResult.risk_adjusted_signals.map((rs, i) => (
                          <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-white/5">
                            <div>
                              <div className="text-base font-mono text-white font-medium">{rs.ticker}</div>
                              <div className="text-[10px] text-white/30 mt-0.5">Max: ${rs.max_position_size?.toLocaleString()}</div>
                            </div>
                            <div className="text-right">
                              <SignalBadge signal={rs.signal} />
                              <ConfidenceBar value={rs.confidence} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </SpotlightCard>
                  )}

                  {/* Portfolio Decisions */}
                  {analysisResult.portfolio_output?.positions?.length > 0 && (
                    <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(52,211,153,0.08)">
                      <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                        <iconify-icon icon="solar:wallet-linear" className="text-emerald-400" />
                        Portfolio Decisions
                        <span className="ml-auto text-xs text-white/30">
                          Cash: ${analysisResult.portfolio_output.cash_remaining?.toLocaleString()}
                        </span>
                      </h3>
                      <div className="space-y-3">
                        {analysisResult.portfolio_output.positions.map((pos, i) => (
                          <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-black/40 border border-white/5">
                            <div className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${ACTION_STYLES[pos.action?.toLowerCase()] || ACTION_STYLES.hold}`}>
                              {pos.action}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-white font-medium">{pos.ticker}</span>
                                <span className="text-white/30 text-xs">×{pos.quantity}</span>
                                <ConfidenceBar value={pos.confidence} />
                              </div>
                              <p className="text-[11px] text-white/40 mt-1">{pos.reasoning}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SpotlightCard>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Backtesting ────────────────────────────────────────────────── */}
        {activeTab === 'backtest' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-5">
              <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(16,185,129,0.12)">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <iconify-icon icon="solar:graph-up-linear" className="text-emerald-400" />
                  Backtest Configuration
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Tickers</label>
                    <input value={btTickers} onChange={e => setBtTickers(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Start Date</label>
                      <input type="date" value={btStartDate} onChange={e => setBtStartDate(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">End Date</label>
                      <input type="date" value={btEndDate} onChange={e => setBtEndDate(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Starting Cash ($)</label>
                    <input type="number" value={btCash} onChange={e => setBtCash(Number(e.target.value))}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Frequency</label>
                    <select value={btFrequency} onChange={e => setBtFrequency(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  {/* Protection */}
                  <div className="border-t border-white/5 pt-4">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Downside Protection (%)</p>
                    <div className="space-y-3">
                      {[
                        { label: 'Stop Loss', val: btStopLoss, setter: setBtStopLoss },
                        { label: 'Trailing Stop', val: btTrailingStop, setter: setBtTrailingStop },
                        { label: 'Take Profit', val: btTakeProfit, setter: setBtTakeProfit },
                      ].map(({ label, val, setter }) => (
                        <div key={label} className="flex items-center gap-3">
                          <label className="text-xs text-white/50 w-24 flex-shrink-0">{label}</label>
                          <input type="number" value={val} onChange={e => setter(e.target.value === '' ? '' : Number(e.target.value))} placeholder="—"
                            className="flex-1 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SpotlightCard>

              <StarBorder as="button" onClick={runBacktest} disabled={btLoading} color="#10b981" speed="4s" className={`w-full ${btLoading ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <span className="flex items-center justify-center gap-2">
                  {btLoading ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Running Backtest...</> : <><iconify-icon icon="solar:graph-up-linear" />Run Backtest</>}
                </span>
              </StarBorder>
            </div>

            <div className="lg:col-span-2">
              {btError && (
                <div className="glass-panel rounded-2xl p-5 border border-red-500/20 bg-red-500/5 mb-5">
                  <p className="text-sm text-red-300">{btError}</p>
                </div>
              )}
              {btLoading && (
                <div className="glass-panel rounded-2xl p-16 text-center">
                  <div className="w-16 h-16 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin mx-auto mb-6" />
                  <h3 className="text-lg font-medium text-white mb-2">Running Backtest</h3>
                  <p className="text-sm text-white/30">Simulating {btTickers} from {btStartDate} to {btEndDate}…</p>
                </div>
              )}
              {!btResult && !btLoading && !btError && (
                <div className="glass-panel rounded-2xl p-16 text-center">
                  <iconify-icon icon="solar:graph-up-linear" width="48" className="text-white/20 mb-4 block" />
                  <h3 className="text-lg font-medium text-white mb-2">Configure & Run</h3>
                  <p className="text-sm text-white/30">Set date range and tickers, then run the historical simulation</p>
                </div>
              )}
              {btResult && (
                <SpotlightCard className="glass-panel border-white/5 rounded-2xl overflow-hidden" spotlightColor="rgba(16,185,129,0.1)">
                  {/* Header Banner */}
                  <div className="bg-white/[0.03] border-b border-white/5 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                        <iconify-icon icon="solar:globus-bold-duotone" className="text-emerald-400" />
                        INSTITUTIONAL BACKTEST REPORT
                      </h3>
                      <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-medium mt-1">Simulation ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                    </div>
                    <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                      {[
                        { id: 'overview', label: 'Overview', icon: 'solar:chart-2-linear' },
                        { id: 'stats', label: 'Statistics', icon: 'solar:library-linear' },
                        { id: 'analysis', label: 'Analysis', icon: 'solar:filters-linear' },
                        { id: 'trades', label: 'Trades', icon: 'solar:list-bold-duotone' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setBtResultsTab(tab.id as any)}
                          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-all ${btResultsTab === tab.id ? 'bg-emerald-500 text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                        >
                          <iconify-icon icon={tab.icon} />
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-6">
                    {/* Tab 1: Overview */}
                    {btResultsTab === 'overview' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Summary Box */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: 'Equity', val: `$${btEquityData[btEquityData.length-1]?.value.toLocaleString()}`, color: 'text-white' },
                            { label: 'Net Profit', val: `$${(btEquityData[btEquityData.length-1]?.value - btCash).toLocaleString()}`, color: 'text-emerald-400' },
                            { label: 'Returns', val: `${((btEquityData[btEquityData.length-1]?.value / btCash - 1) * 100).toFixed(2)}%`, color: 'text-emerald-400' },
                            { label: 'Volume', val: `$${btResult.results?.trades?.length * 10000}+`, color: 'text-white/40' },
                          ].map(stat => (
                            <div key={stat.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                              <div className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-1">{stat.label}</div>
                              <div className={`text-xl font-bold tracking-tighter font-mono ${stat.color}`}>{stat.val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Equity Chart */}
                        {btEquityData.length > 0 && (
                          <div className="p-1 bg-gradient-to-b from-emerald-500/10 to-transparent rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                            <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[calc(1rem-4px)]">
                              <EquityChart data={btEquityData} baseValue={btCash} height={400} />
                            </div>
                          </div>
                        )}
                        
                        {/* Top Metrics Row */}
                        <div className="pt-4 border-t border-white/5">
                           <h4 className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-4">Core Performance Snapshot</h4>
                           <PerformanceTable data={btEquityData} baseValue={btCash} />
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Statistics */}
                    {btResultsTab === 'stats' && (
                      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center justify-between mb-6">
                           <h4 className="text-xs text-white/40 uppercase tracking-[0.3em] font-black">All Algorithmic Statistics</h4>
                           <div className="text-[10px] text-emerald-500/50 flex items-center gap-1 font-mono">
                             <iconify-icon icon="solar:verified-check-bold" />
                             Verified Quantum Execution
                           </div>
                        </div>
                        <PerformanceTable data={btEquityData} baseValue={btCash} />
                        <div className="mt-12 p-8 rounded-2xl bg-white/[0.01] border border-white/5 text-center">
                           <iconify-icon icon="solar:chart-square-linear" width="32" className="text-white/10 mb-3" />
                           <p className="text-[11px] text-white/30 max-w-md mx-auto italic font-medium leading-relaxed">
                             "The statistics above reflect a comprehensive risk-adjusted performance profile of the selected tickers across the historical timeline. Note that backtest performance is not indicative of future alpha."
                           </p>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Analysis */}
                    {btResultsTab === 'analysis' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Heatmap */}
                        <div>
                          <h4 className="text-xs text-white uppercase tracking-widest font-black mb-6 flex items-center gap-2">
                            <iconify-icon icon="solar:mask-vibrant-bold" className="text-emerald-400" />
                            Monthly Returns Heatmap
                          </h4>
                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                            <MonthlyReturnsHeatmap data={btEquityData} />
                          </div>
                        </div>

                        {/* Drawdown */}
                        <div>
                          <h4 className="text-xs text-white uppercase tracking-widest font-black mb-6 flex items-center gap-2">
                             <iconify-icon icon="solar:danger-triangle-bold" className="text-red-500" />
                             Underwater (Drawdown %)
                          </h4>
                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                            <DrawdownChart data={btEquityData} height={350} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 4: Trades */}
                    {btResultsTab === 'trades' && (
                      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center justify-between mb-6">
                          <h4 className="text-xs text-white/40 uppercase tracking-widest font-black">Execution Journal</h4>
                          <span className="text-[10px] text-white/20 font-mono">{btResult.results?.trades?.length} Orders Logged</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                          {btResult.results?.trades?.map((t: any, i: number) => (
                            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all group">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${t.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                {t.action[0]}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-white text-sm font-bold tracking-tight">{t.ticker}</span>
                                  <span className="text-white/20 text-[9px] uppercase font-bold tracking-[0.2em]">{t.action}</span>
                                </div>
                                <div className="text-[10px] text-white/40 font-mono mt-0.5">{t.date}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-white text-[11px] font-bold">${(t.price * t.quantity).toLocaleString()}</div>
                                <div className="text-[10px] text-white/30 font-mono mt-0.5">{t.quantity} @ ${t.price}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SpotlightCard>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Paper Trading ──────────────────────────────────────────────── */}
        {activeTab === 'paper' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-5">
              <SpotlightCard className="glass-panel rounded-2xl p-5" spotlightColor="rgba(79,143,255,0.12)">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <iconify-icon icon="solar:wallet-linear" className="text-blue-400" />
                  Paper Trade Config
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Tickers to Trade</label>
                    <input value={ptTickers} onChange={e => setPtTickers(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-widest mb-1 block">Starting Cash ($)</label>
                    <input type="number" value={ptCash} onChange={e => setPtCash(Number(e.target.value))}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                  </div>
                </div>
              </SpotlightCard>

              <div className="space-y-2">
                <StarBorder as="button" onClick={runPaperTrade} disabled={ptLoading} color="#4f8fff" speed="4s" className={`w-full ${ptLoading ? 'opacity-30 cursor-not-allowed' : ''}`}>
                  <span className="flex items-center justify-center gap-2">
                    {ptLoading ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Running Cycle...</> : <><iconify-icon icon="solar:play-circle-linear" />Run Trading Cycle</>}
                  </span>
                </StarBorder>
                <button onClick={resetPaperPortfolio} disabled={ptLoading}
                  className="w-full py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 text-sm transition-all">
                  Reset Portfolio (${ptCash.toLocaleString()})
                </button>
              </div>
              {ptError && <div className="glass-panel rounded-2xl p-4 border border-red-500/20 bg-red-500/5"><p className="text-xs text-red-300">{ptError}</p></div>}
            </div>

            <div className="lg:col-span-2 space-y-5">
              {/* Candlestick Market Grid — driven by ptTickers */}
              {(() => {
                const tickers = ptTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
                return tickers.length > 0 ? (
                  <div className={`grid gap-4 mb-6 ${tickers.length === 1 ? 'grid-cols-1' : tickers.length <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {tickers.map(ticker => (
                      <CandleMiniChart
                        key={ticker}
                        ticker={ticker}
                        height={190}
                        live
                        pollIntervalMs={8000}
                        selected={activePaperTicker === ticker}
                        onSelect={setActivePaperTicker}
                        usdToInr={usdToInr}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="h-[190px] rounded-xl border border-white/8 bg-[#0a0a0b] flex items-center justify-center text-white/30 text-sm mb-6">
                    Enter tickers above to see live charts
                  </div>
                );
              })()}

              {/* Auto Trading Master Switch */}
              <div className="flex items-center justify-between p-4 rounded-2xl glass-panel border border-white/10 bg-[#0a0a0b]">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-all ${isAutoTrading ? 'bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-red-500/10 text-red-500'}`}>
                    <iconify-icon icon={isAutoTrading ? "solar:radar-bold" : "solar:radar-linear"} width="24" className={isAutoTrading ? "animate-pulse" : ""} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">Autonomous Trading Engine</h3>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">{isAutoTrading ? 'System is actively analyzing & executing' : 'System is paused (Manual Override)'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAutoTrading(!isAutoTrading)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${isAutoTrading ? 'bg-emerald-500' : 'bg-white/10'}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-black transition-transform ${isAutoTrading ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>

              {paperPortfolio ? (
                <>
                  {/* Portfolio Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Total Value', val: `$${paperPortfolio.total_value?.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'text-white' },
                      { label: 'Cash', val: `$${paperPortfolio.cash?.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'text-blue-400' },
                      { label: 'Positions', val: Object.keys(paperPortfolio.positions || {}).length.toString(), color: 'text-purple-400' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="glass-panel rounded-2xl p-5 text-center">
                        <div className={`text-2xl font-medium tracking-tight ${color}`}>{val}</div>
                        <div className="text-[10px] text-white/30 uppercase tracking-widest mt-1">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Advanced Chart */}
                  <div className="glass-panel text-white rounded-2xl border border-white/10 p-5 mb-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <iconify-icon icon="solar:chart-square-linear" className="text-blue-400" />
                        Trading View
                      </h3>
                      <div className="flex gap-2 flex-wrap">
                        {Object.keys(paperPortfolio.positions || {}).length > 0 ? (
                          Object.keys(paperPortfolio.positions).map(ticker => (
                            <button key={ticker} onClick={() => setActivePaperTicker(ticker)} className={`text-[10px] px-3 py-1 rounded-full uppercase tracking-widest transition-colors ${activePaperTicker === ticker ? 'bg-blue-500 text-white font-bold' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>
                              {ticker}
                            </button>
                          ))
                        ) : (
                          <span className="text-[10px] text-white/30 uppercase tracking-widest">No Active Positions</span>
                        )}
                      </div>
                    </div>
                    {activePaperTicker && paperChartData.ohlc.length > 0 ? (
                      <div className="p-1 bg-gradient-to-b from-blue-500/10 to-transparent rounded-2xl overflow-hidden">
                        <AdvancedChart data={paperChartData.ohlc} volumeData={paperChartData.volume} markers={paperChartData.markers} height={450} ticker={activePaperTicker} />
                      </div>
                    ) : (
                      <div className="h-[350px] flex items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                        <p className="text-sm text-white/30">
                          {activePaperTicker ? 'Loading Chart Data...' : 'Select a ticker to view technicals'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Positions */}
                  {Object.keys(paperPortfolio.positions).length > 0 && (
                    <SpotlightCard className="glass-panel rounded-2xl p-6" spotlightColor="rgba(79,143,255,0.15)">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <iconify-icon icon="solar:wallet-bold" className="text-blue-400" />
                          ALGORITHMIC POSITIONS
                        </h3>
                        <span className="text-[10px] text-white/30 font-mono tracking-widest">REAL-TIME VALUATION</span>
                      </div>
                      <div className="space-y-3">
                        {Object.entries(paperPortfolio.positions).map(([ticker, pos]) => {
                          const pnl = (pos.current_price - pos.avg_cost) * pos.shares;
                          const pnlPct = ((pos.current_price / pos.avg_cost) - 1) * 100;
                          return (
                            <div key={ticker} className="group relative flex items-center gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all">
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 rounded-r-full bg-blue-500/0 group-hover:bg-blue-500/40 transition-all" />
                              <div className="flex flex-col">
                                <span className="font-mono text-lg text-white font-black tracking-tighter leading-none">{ticker}</span>
                                <span className="text-[9px] text-white/30 uppercase tracking-[0.2em] mt-1 font-bold">Equity Asset</span>
                              </div>
                              <div className="flex-1 grid grid-cols-3 gap-4 border-l border-white/5 pl-6 ml-2">
                                <div>
                                  <div className="text-[9px] text-white/20 uppercase tracking-widest font-bold mb-1">Exposure</div>
                                  <div className="text-xs text-white/70 font-mono">{pos.shares} <span className="text-[10px] text-white/30">units</span></div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-white/20 uppercase tracking-widest font-bold mb-1">Cost Basis</div>
                                  <div className="text-xs text-white/70 font-mono">${pos.avg_cost?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-white/20 uppercase tracking-widest font-bold mb-1">Market</div>
                                  <div className="text-xs text-white font-bold font-mono">${pos.current_price?.toFixed(2)}</div>
                                </div>
                              </div>
                              <div className="text-right pl-4">
                                <div className={`text-sm font-black font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {pnl >= 0 ? '▲' : '▼'} ${Math.abs(pnl).toLocaleString()}
                                </div>
                                <div className={`text-[10px] font-bold mt-0.5 ${pnl >= 0 ? 'text-emerald-500/50' : 'text-red-500/50'}`}>
                                  {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </SpotlightCard>
                  )}

                  {/* Trade History */}
                  {paperPortfolio.trades?.length > 0 && (
                    <SpotlightCard className="glass-panel rounded-2xl p-6" spotlightColor="rgba(79,143,255,0.1)">
                      <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                        <iconify-icon icon="solar:history-bold" className="text-blue-400/60" />
                        Execution Journal
                      </h3>
                      <div className="max-h-96 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {[...paperPortfolio.trades].reverse().slice(0, 50).map((t, i) => (
                          <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${t.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                              {t.action[0]}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-white text-sm font-bold tracking-tight">{t.ticker}</span>
                                <span className="text-white/20 text-[9px] uppercase font-bold tracking-[0.2em]">{t.action}</span>
                              </div>
                              <div className="text-[10px] text-white/40 font-mono mt-0.5">{t.timestamp ? new Date(t.timestamp).toLocaleString() : ''}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white text-[11px] font-bold">${t.total?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                              <div className="text-[10px] text-white/30 font-mono mt-0.5">{t.quantity} @ ${t.price?.toFixed(2)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SpotlightCard>
                  )}
                </>
              ) : (
                <div className="glass-panel rounded-2xl p-16 text-center">
                  <iconify-icon icon="solar:wallet-linear" width="48" className="text-white/20 mb-4 block" />
                  <h3 className="text-lg font-medium text-white mb-2">No Portfolio Yet</h3>
                  <p className="text-sm text-white/30">Set your starting cash and run a trading cycle</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Risk Monitor ──────────────────────────────────────────────── */}
        {activeTab === 'risk' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {analysisResult?.risk_adjusted_signals?.length ? (
                <>
                  {/* Correlation Groups */}
                  <SpotlightCard className="glass-panel rounded-2xl p-6" spotlightColor="rgba(251,191,36,0.1)">
                    <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                      <iconify-icon icon="solar:shield-warning-linear" className="text-amber-400" />
                      Risk-Adjusted Signals
                    </h3>
                    <div className="space-y-3">
                      {analysisResult.risk_adjusted_signals.map((rs, i) => (
                        <div key={i} className="p-4 rounded-xl bg-black/40 border border-white/5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-mono text-white">{rs.ticker}</span>
                            <SignalBadge signal={rs.signal} />
                          </div>
                          <ConfidenceBar value={rs.confidence} />
                          <div className="text-[10px] text-white/30 mt-2">Max position: ${rs.max_position_size?.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </SpotlightCard>

                </>
              ) : (
                <div className="col-span-2 glass-panel rounded-2xl p-16 text-center">
                  <iconify-icon icon="solar:shield-warning-linear" width="48" className="text-white/20 mb-4 block" />
                  <h3 className="text-lg font-medium text-white mb-2">Run Analysis First</h3>
                  <p className="text-sm text-white/30">Run a multi-agent analysis to see risk signal data here</p>
                  <button onClick={() => setActiveTab('analyze')}
                    className="mt-6 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors">
                    Go to Analysis →
                  </button>
                </div>
              )}
            </div>

            {/* Risk Equity Curve */}
            <SpotlightCard className="glass-panel rounded-2xl p-8" spotlightColor="rgba(239,68,68,0.1)">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                  <iconify-icon icon="solar:graph-down-bold" className="text-red-500" />
                  STRESS LEVEL & DRAWDOWN ANALYSIS
                </h3>
              </div>
              {btEquityData.length > 0 ? (
                <div className="space-y-8">
                  <div className="p-1 bg-gradient-to-b from-red-500/10 to-transparent rounded-2xl overflow-hidden">
                    <EquityChart data={btEquityData} baseValue={btCash} height={400} />
                  </div>
                  <div className="pt-4 border-t border-white/5">
                    <h4 className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold mb-6">Simulation Efficiency Metrics</h4>
                    <PerformanceTable data={btEquityData} baseValue={btCash} />
                  </div>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center border border-dashed border-white/10 rounded-3xl bg-white/[0.01]">
                   <div className="text-center">
                    <iconify-icon icon="solar:shield-danger-bold-duotone" width="48" className="text-white/10 mb-4" />
                    <p className="text-sm text-white/30 font-medium tracking-tight">Requires Backtest Payload to Initialize Core Stress Monitor</p>
                   </div>
                </div>
              )}
            </SpotlightCard>

          </div>
        )}

        {/* ── TAB: Telegram Notifications ─────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Header card */}
            <SpotlightCard spotlightColor="rgba(82,39,255,0.12)" className="p-6 rounded-2xl border border-white/8 bg-white/[0.02]">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-lg">📬</div>
                <div>
                  <h2 className="text-base font-semibold text-white">Telegram Alerts</h2>
                  <p className="text-[11px] text-white/40">Routine market digests &amp; critical alerts delivered to your Telegram.</p>
                </div>
                <div className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${notifConfigured ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${notifConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {notifConfigured ? 'Connected' : 'Not configured'}
                </div>
              </div>
            </SpotlightCard>

            {/* Credentials */}
            <SpotlightCard spotlightColor="rgba(82,39,255,0.08)" className="p-6 rounded-2xl border border-white/8 bg-white/[0.02]">
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-4">Bot Credentials</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] text-white/40 block mb-1.5">Telegram Bot Token</label>
                  <input
                    type="password"
                    value={tgBotToken}
                    onChange={e => setTgBotToken(e.target.value)}
                    placeholder="1234567890:ABCdef..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                  />
                  <p className="text-[10px] text-white/25 mt-1">Create a bot via <span className="text-blue-400">@BotFather</span> on Telegram.</p>
                </div>
                <div>
                  <label className="text-[11px] text-white/40 block mb-1.5">Chat ID</label>
                  <input
                    type="text"
                    value={tgChatId}
                    onChange={e => setTgChatId(e.target.value)}
                    placeholder="-100123456789 or your personal chat ID"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                  />
                  <p className="text-[10px] text-white/25 mt-1">Send a message to your bot, then use <span className="text-blue-400">@userinfobot</span> to get your chat ID.</p>
                </div>
              </div>
            </SpotlightCard>

            {/* Digest schedule */}
            <SpotlightCard spotlightColor="rgba(82,39,255,0.08)" className="p-6 rounded-2xl border border-white/8 bg-white/[0.02]">
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-4">Routine Digest Schedule</h3>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm text-white font-medium">Enable Auto Digest</div>
                  <div className="text-[11px] text-white/35 mt-0.5">Sends market summary + top news to Telegram on schedule.</div>
                </div>
                <button
                  onClick={() => setDigestEnabled(v => !v)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${digestEnabled ? 'bg-purple-500' : 'bg-white/10'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${digestEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-2">Interval</label>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 6, 12, 24].map(h => (
                    <button
                      key={h}
                      onClick={() => setDigestInterval(h)}
                      className={`py-2 rounded-xl text-sm font-medium border transition-all ${digestInterval === h ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-white/[0.03] border-white/10 text-white/40 hover:text-white/70'}`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-white/25 mt-2">Digest will be sent every {digestInterval} hour{digestInterval > 1 ? 's' : ''}.</p>
              </div>
            </SpotlightCard>

            {/* Feedback message */}
            {notifMsg && (
              <div className={`px-4 py-3 rounded-xl border text-sm ${notifMsg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                {notifMsg.ok ? '✓ ' : '✗ '}{notifMsg.text}
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StarBorder
                as="button"
                onClick={saveNotifConfig}
                disabled={notifLoading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 transition-colors"
                color="#a78bfa"
                speed="4s"
              >
                {notifLoading ? 'Saving…' : 'Save Config'}
              </StarBorder>
              <button
                onClick={sendTestTelegram}
                disabled={notifLoading || !notifConfigured}
                className="py-2.5 rounded-xl text-sm font-medium border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/20 disabled:opacity-40 transition-all"
              >
                Send Test Ping
              </button>
              <button
                onClick={sendDigestNow}
                disabled={digestSending || !notifConfigured}
                className="py-2.5 rounded-xl text-sm font-medium border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/20 disabled:opacity-40 transition-all"
              >
                {digestSending ? 'Sending…' : 'Send Digest Now'}
              </button>
            </div>

            {/* Info box */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/8 space-y-2">
              <p className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">What the digest includes</p>
              {['🏦 Live NIFTY / SENSEX snapshot', '🔥 Top 5 trending NSE stocks', '📰 Top 7 business news headlines', '⚠️ Critical stock alerts (>3% drop)'].map(item => (
                <div key={item} className="text-[12px] text-white/50">{item}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Global Activity Terminal (Bottom Bar) */}
      <div className="fixed bottom-0 left-0 right-0 z-[60] bg-[#0a0a0b]/90 backdrop-blur-xl border-t border-white/5 h-10 flex items-center px-6 overflow-hidden select-none">
          <div className="flex items-center gap-4 border-r border-white/10 pr-4 mr-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-[10px] text-white/50 font-black uppercase tracking-widest whitespace-nowrap">System Active</span>
          </div>
          <div className="flex-1 relative overflow-hidden h-full flex items-center">
              <div className="animate-marquee-slow flex whitespace-nowrap gap-12 items-center">
                  {terminalLogs.length > 0 ? (
                      terminalLogs.map((log, i) => (
                        <span key={i} className="text-[10px] font-mono text-white/40 group cursor-default">
                           <span className="text-emerald-500/40">{log.split(' ')[0]}</span>
                           <span className="ml-2 group-hover:text-white transition-colors">{log.split(' ').slice(1).join(' ')}</span>
                        </span>
                      ))
                  ) : (
                      <span className="text-[10px] font-mono text-white/20">Awaiting Signal Matrix Initialization...</span>
                  )}
              </div>
          </div>
          <div className="flex items-center gap-6 border-l border-white/10 pl-4 ml-4">
              <div className="flex items-center gap-2">
                  <span className="text-[9px] text-white/30 uppercase tracking-tighter">Latency:</span>
                  <span className="text-[10px] text-emerald-400 font-mono">14ms</span>
              </div>
              <div className="flex items-center gap-2">
                  <span className="text-[9px] text-white/30 uppercase tracking-tighter">Load:</span>
                  <span className="text-[10px] text-amber-400 font-mono">2.4%</span>
              </div>
          </div>
      </div>
    </main>
  );
}
