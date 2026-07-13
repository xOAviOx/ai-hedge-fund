// API contract types — mirror the FastAPI v1 responses exactly (app/api/v1/*).
// Kept in one place so every page/hook shares the same shapes. No `any`.

export type Direction = 'bullish' | 'bearish' | 'neutral';
export type OrderAction = 'buy' | 'sell' | 'hold';

// ── market ────────────────────────────────────────────────────────────
export interface Quote {
  symbol: string;
  price: number;
  currency: string | null;
  previous_close: number | null;
  change: number | null;
  change_pct: number | null;
  ts: string;
}

export interface OHLCVBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface OHLCV {
  symbol: string;
  interval: string;
  bars: OHLCVBar[];
}

export interface NewsItem {
  title: string;
  publisher: string | null;
  link: string | null;
  published: string | null;
  summary: string | null;
}

export interface News {
  symbol: string;
  items: NewsItem[];
}

export interface FxRate {
  pair: string;
  rate: number;
  ts: string;
}

export interface TickerDetails {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  currency: string | null;
  exchange: string | null;
  employees: number | null;
  description: string | null;
  shares_outstanding: number | null;
}

export interface SearchResult {
  query: string;
  symbol: string;
  details: TickerDetails | null;
}

// ── fund ──────────────────────────────────────────────────────────────
export interface Fund {
  fund_id: string;
  base_currency: string;
  starting_cash: number;
  cash: number;
  universe: string[];
  position_cap_pct: number;
  active_personas: string[];
  schedule_cron: string;
  is_paused: boolean;
  latest_nav: number;
}

export interface Position {
  ticker: string;
  shares: number;
  avg_cost: number;
  currency: string;
  cost_basis: number;
}

export interface Order {
  id: number;
  run_id: string | null;
  ticker: string;
  action: OrderAction;
  quantity: number;
  price: number;
  reasoning: string;
  ts: string;
}

export interface NavPoint {
  ts: string;
  nav: number;
  cash: number;
  positions_value: number;
}

export interface RunNowResult {
  status: 'ok' | 'paused';
  fund_id: string;
  run_id: string | null;
  universe?: string[];
  orders?: OrderLite[];
  nav?: number;
  cash?: number;
  positions_value?: number;
  memo?: string | null;
  timings?: Record<string, number>;
}

export interface FundConfigPatch {
  universe?: string[];
  active_personas?: string[];
  position_cap_pct?: number;
  schedule_cron?: string;
  base_currency?: string;
}

// ── decisions ─────────────────────────────────────────────────────────
export interface RunSummary {
  run_id: string;
  ts: string;
  universe: string[];
  latency_ms: number;
  has_memo: boolean;
  order_count: number;
}

export interface DecisionSignal {
  agent: string;
  direction: Direction;
  confidence: number;
  factors: string;
}

export interface OrderLite {
  ticker: string;
  action: OrderAction;
  quantity: number;
  price: number;
  reasoning: string;
}

export interface RunDetail {
  run_id: string;
  ts: string;
  universe: string[];
  latency_ms: number;
  llm_cost: number;
  memo: string | null;
  signals_by_ticker: Record<string, DecisionSignal[]>;
  orders: OrderLite[];
}

// ── research ──────────────────────────────────────────────────────────
export interface RawSignal {
  agent_id: string;
  ticker: string;
  signal: Direction;
  confidence: number;
  reasoning: string;
}

export interface RiskConsensus {
  ticker: string;
  signal: Direction;
  confidence: number;
  bull_count: number;
  bear_count: number;
}

export interface ResearchResult {
  ticker: string;
  price: number | null;
  risk: RiskConsensus | null;
  order: OrderLite | null;
  signals: Record<string, RawSignal>;
  memo: string | null;
  timings: Record<string, number>;
}

// ── risk ──────────────────────────────────────────────────────────────
export interface RiskExposure {
  ticker: string;
  cost_basis: number;
  weight_pct: number;
}

export interface CorrelationMatrix {
  tickers: string[];
  matrix: (number | null)[][];
}

export interface RiskReport {
  nav_points: number;
  current_nav: number | null;
  volatility_pct: number | null;
  max_drawdown_pct: number | null;
  exposure: RiskExposure[];
  note: string;
  // Phase 6 depth — computed from cached OHLCV
  benchmark: string;
  annualized_vol_pct: number | null;
  var_95_pct: number | null;
  sharpe: number | null;
  beta: number | null;
  portfolio_drawdown_pct: number | null;
  correlation: CorrelationMatrix;
  monthly_returns: Record<string, number>;
  data_points: number;
}

// ── meta ──────────────────────────────────────────────────────────────
export interface CacheStats {
  cache_hits: number;
  cache_misses: number;
  provider_calls: number;
  errors: number;
  hit_rate: number;
}

export interface SchedulerJob {
  id: string;
  next_run_time: string | null;
}

export interface MetaStats {
  cache: CacheStats;
  llm_cost: number;
  scheduler: { running: boolean; jobs: SchedulerJob[] };
}
