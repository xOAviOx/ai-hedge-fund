# PortAI — Institutional-Grade Financial Intelligence

[![Stack](https://img.shields.io/badge/Stack-FastAPI_%7C_Next.js_%7C_LangGraph-blueviolet?style=for-the-badge)]()
[![AI](https://img.shields.io/badge/AI-Multi--Agent_%7C_15%2B_Personas-blue?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

> Hedge-fund quality analysis for every Indian retail investor.

PortAI is a full-stack AI-powered financial intelligence platform that brings the tools of professional portfolio managers, quant analysts, and institutional hedge funds to the fingertips of everyday investors. Built with a FastAPI backend and a Next.js frontend, it combines real-time market data, multi-agent AI analysis, and advanced charting into one unified platform.

---

## Table of Contents

- [Vision](#vision)
- [Tech Stack](#tech-stack)
- [Features](#features)
  - [Markets & Live Data](#markets--live-data)
  - [AI Intelligence Engine](#ai-intelligence-engine)
  - [Hedge Fund Dashboard — Stratton Engine](#hedge-fund-dashboard--stratton-engine)
  - [Technical Charts](#technical-charts)
  - [Portfolio & Screener Tools](#portfolio--screener-tools)
  - [Alternative Data](#alternative-data)
  - [Risk & Derivatives](#risk--derivatives)
  - [Global & Macro](#global--macro)
  - [Notifications](#notifications)
  - [Multi-Language Support](#multi-language-support)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Team](#team)

---

## Vision

Retail investors in India often lack the sophisticated tools available to institutional players — deep fundamental analysis, real-time risk monitoring, multi-strategy AI scoring, and access to global macro data. PortAI bridges this gap entirely.

The platform is built with a dual focus:
- **Indian retail investors** who need NSE/BSE data, INR-native pricing, and analysis framed through the lens of Indian market legends like Rakesh Jhunjhunwala and Mohnish Pabrai.
- **Global investors** who want simultaneous exposure to US equities, forex, commodities, crypto, and macro trends — with live USD/INR conversion built in.

---

## 6-Layer Agent Orchestration

The Stratton Engine is built on **LangGraph** and executes a structured 6-layer pipeline every time a portfolio or ticker analysis is triggered. Each layer has a distinct responsibility, and the entire graph is stateless and reproducible — all decisions are traceable back to individual agent signals.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Data Ingestion                                           │
│  Prefetch prices, financials, news, and company details for all     │
│  tickers + SPY + 8 sector ETFs (XLK, XLF, XLE, XLV, XLI…)         │
│  All data loaded into shared AgentState before any agent runs.      │
│  Prevents parallel agents from blowing API rate limits.             │
└────────────────────────────┬────────────────────────────────────────┘
                             │  fan-out (parallel)
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  LAYER 2         │ │  LAYER 3         │ │  (continued...)  │
│  Specialist      │ │  Investor Persona│ │                  │
│  Analyst Agents  │ │  Agents          │ │                  │
│                  │ │                  │ │                  │
│  · Technical     │ │  · Buffett       │ │  · Jhunjhunwala  │
│  · Sentiment     │ │  · Munger        │ │  · Pabrai        │
│  · Fundamentals  │ │  · Graham        │ │  · Damodaran     │
│  · Valuation     │ │  · Lynch         │ │  · Druckenmiller │
│  · Macro Regime  │ │  · Fisher        │ │  · Burry         │
│  · Growth        │ │  · Wood          │ │  · Ackman        │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                    │
         └──────────┬─────────┘────────────────────┘
                    │  fan-in (all signals merged)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — Risk Aggregation (Risk Manager Agent)                    │
│  Collects every agent's bullish/bearish signal + confidence score.  │
│  Computes weighted consensus vote per ticker.                       │
│  Applies position-sizing caps and stop-loss constraints.            │
│  Outputs risk-adjusted signals with max_position_size per ticker.   │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — Portfolio Allocation (Portfolio Manager Agent)           │
│  Converts risk-adjusted signals into concrete buy/hold/sell orders. │
│  Allocates capital (up to 30% of cash per position).               │
│  Computes exact share quantities at current market prices.          │
│  Respects existing positions and available cash balance.            │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 6 — Output State                                             │
│  Final AgentState exported: all analyst signals, risk ratings,      │
│  portfolio decisions, and per-agent reasoning chains.               │
│  Returned to the FastAPI endpoint → streamed to the frontend.       │
└─────────────────────────────────────────────────────────────────────┘
```

### How It Works End-to-End

1. **Layer 1 — Data Ingestion**: Before any agent runs, a `_prefetch_all()` call loads OHLCV prices, financial metrics (last 8 quarters), news (last 20 articles), and company details into the shared `AgentState`. Sector ETFs (XLK, XLF, XLE…) and SPY are also pre-loaded for macro regime analysis. Agents never make API calls — they only read from state. This design keeps the system within free-tier API rate limits even when 15+ agents run in parallel.

2. **Layer 2 — Specialist Analyst Agents** (run in parallel): Six domain-specialist agents each produce an independent signal:
   - **Technical** — SMA crossovers, RSI, momentum, trend strength
   - **Sentiment** — NLP scoring of recent news headlines (positive/negative word frequency + recency weighting)
   - **Fundamentals** — Revenue growth, margin trends, debt ratios over 8 quarters
   - **Valuation** — P/E, EV/EBITDA, DCF-based intrinsic value estimates
   - **Macro Regime** — Beta vs SPY, sector rotation strength, market breadth
   - **Growth** — Revenue CAGR, earnings acceleration, TAM expansion signals

3. **Layer 3 — Investor Persona Agents** (run in parallel with Layer 2): 11+ agents each apply a famous investor's philosophy to the same pre-fetched data. Each persona weights different signals differently — Buffett weights moat and ROIC; Burry weights debt and contrarian sentiment; Jhunjhunwala weights India-specific growth narratives.

4. **Layer 4 — Risk Aggregation**: The Risk Manager receives all signals from Layers 2 and 3 via LangGraph's fan-in pattern. It tallies bull vs. bear votes per ticker, computes average confidence, and applies portfolio-level guardrails (max position size, stop-loss levels) to produce risk-adjusted signals.

5. **Layer 5 — Portfolio Allocation**: The Portfolio Manager converts risk-adjusted signals into actionable orders. Bullish signals with confidence ≥ 50 trigger a buy order sized at `min(max_position_size, cash × 30%)`. Bearish signals trigger sells of existing positions. Neutral signals hold.

6. **Layer 6 — Output State**: The final `AgentState` (messages, data, metadata) is returned from `graph.invoke()` to the FastAPI endpoint, which serialises it and streams the result to the frontend hedge fund dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI (Python 3.11), asyncio, Pydantic |
| AI Engine | LangGraph, LangChain, OpenAI / Anthropic LLMs |
| Market Data | yfinance, real-time REST polling |
| Charts | TradingView Lightweight Charts v5 |
| Authentication | Supabase (OAuth + email/password) |
| Notifications | Telegram Bot API |
| Translation | Google Translate Widget (custom UI) |
| Background FX | UnicornStudio WebGL animations |

---

## Features

### Markets & Live Data

- **Live Market Feed** — Real-time prices for NSE/BSE Indian stocks, US equities, global indices (NIFTY 50, SENSEX, S&P 500), crypto, forex, and commodities
- **Currency Intelligence** — Automatic INR/USD detection per ticker. USD stocks display with a live `≈ ₹` equivalent, Indian stocks always show in INR
- **Live USD/INR Rate Bar** — Refreshes every 60 seconds, used site-wide for accurate conversions
- **Equities Screener** — Filter stocks by sector, market cap, P/E ratio, momentum, and more
- **Market Breadth** — Advance/decline ratios, breadth oscillators, and sector heat maps
- **IPO Watch** — Upcoming and recent IPO listings with GMP and subscription tracking
- **Sector Rotation** — Visualize real-time capital flows across all major sectors

### AI Intelligence Engine

The heart of PortAI — a LangGraph-based multi-agent system that simulates 15+ legendary investor decision-making styles and applies them to any ticker simultaneously.

**Investor Persona Agents:**
| School | Agents |
|---|---|
| Value | Warren Buffett, Charlie Munger, Benjamin Graham, Mohnish Pabrai |
| Growth | Peter Lynch, Philip Fisher, Cathie Wood |
| Macro | George Soros, Stanley Druckenmiller, Michael Burry |
| India | Rakesh Jhunjhunwala, Aswath Damodaran |
| Specialist | Technical, Sentiment, Fundamentals, Valuation, Macro Regime, Portfolio Manager, Risk Manager |

- **AI Analyst Page** — Enter any ticker and receive a synthesized investment thesis scored by all active agents
- **News Sentiment Analysis** — NLP-powered scoring on live financial news headlines
- **Earnings Transcripts** — AI-summarized earnings call breakdowns with key talking points
- **ESG Scores** — Environmental, Social, and Governance scoring per company

### Hedge Fund Dashboard — Stratton Engine

The flagship feature of PortAI. A complete simulated hedge fund environment powered by the proprietary Stratton Engine.

**Portfolio Analysis Tab**
- Enter portfolio tickers for deep multi-agent AI analysis
- Each investor agent gives an independent buy/hold/sell signal with reasoning
- Composite portfolio health score synthesized across all agents

**Paper Trading Tab**
- Build a virtual portfolio with any Indian or US ticker
- Live candlestick mini-charts with volume bars update in real time for every position
- One-click deep-dive: click any position to launch the full AI analysis for that stock

**Risk Monitor Tab**
- Real-time portfolio risk metrics: VaR, Sharpe Ratio, Max Drawdown, Beta, Volatility
- Dynamic drawdown chart visualization over time
- Monthly returns heatmap (calendar-style, color-coded)
- Rolling performance statistics table

**Backtesting Tab**
- Full strategy backtesting against historical OHLCV data
- Performance attribution with equity curve visualization

**Notifications Tab**
- Connect a Telegram bot (Bot Token + Chat ID) for automated alerts
- Set digest frequency: hourly, daily, or weekly
- Send on-demand market digests or test messages directly from the dashboard

### Technical Charts

- **Advanced Candlestick Charts** — Live price polling every 8 seconds
- **Overlays** — Bollinger Bands (20,2), EMA, SMA rendered directly on the price pane
- **Sub-Panes** — MACD (line + signal + histogram) and RSI (14) in dedicated panels below
- **HUD Legend** — Live OHLCV, RSI, and MACD values update as you move the crosshair
- **LIVE / HIST Badge** — Clear visual indicator for real-time vs historical mode
- **Trade Markers** — Buy/sell signal arrows rendered directly on candlesticks
- **Preset Tickers** — Curated list of Indian (🇮🇳 NSE) and US (🇺🇸) stocks for quick access
- **Watchlist** — Currency-aware watchlist with 🇮🇳/🇺🇸 flags and correct currency symbols
- **USD ↔ INR Converter Widget** — Live exchange rate converter with one-click flip, embedded in the charts page

### Portfolio & Screener Tools

- **Portfolio Analyzer** — Holdings attribution, diversification scoring, and rebalancing suggestions
- **Fundamental Analysis** — Revenue, margins, ROIC, Free Cash Flow yield, and balance sheet deep-dives
- **Financial Ratios** — Full ratio dashboard: P/E, EV/EBITDA, Debt/Equity, Current Ratio, and 20+ more
- **Peer Comparison** — Side-by-side competitor benchmarking on key metrics
- **Dividend Tracker** — Dividend history, yield trends, ex-dates, and payout ratio analysis
- **ETF Analyzer** — Holdings breakdown, expense ratio, tracking error, and category performance
- **Mutual Funds** — NAV trends, rolling returns, fund manager analysis, and category comparison
- **REIT Analyzer** — Distribution yield, FFO per unit, and property sector breakdown

### Alternative Data

- **Dark Pool Activity** — Institutional block trade signals and unusual volume detection
- **Insider Trading** — Director, promoter, and institutional buy/sell disclosures (India + US)
- **Institutional Holdings** — FII/DII/FPI shareholding changes quarter over quarter
- **Corporate Actions** — Dividends, stock splits, rights issues, buybacks, and bonus shares
- **Correlation Matrix** — Cross-asset and cross-stock correlation heatmap
- **VIX Monitor** — India VIX and CBOE VIX with fear/greed interpretation gauge
- **Yield Curve** — Live G-Sec (India) and US Treasury yield curve with inversion alerts

### Risk & Derivatives

- **Options Chain** — Live NSE options chain with Open Interest, Implied Volatility, and all Greeks
- **Option Greeks Dashboard** — Delta, Gamma, Theta, Vega, Rho visualization with sensitivity analysis
- **Derivatives Heatmap** — OI concentration and Put/Call Ratio heatmap by strike
- **Risk Calculator** — Position sizing, Kelly Criterion, maximum loss estimator per trade
- **Backtesting Engine** — Full historical simulation with transaction cost modeling

### Global & Macro

- **Global Markets** — Live prices and daily change for 40+ global indices
- **Macro Economics** — GDP growth, CPI inflation, PMI, interest rate, and employment dashboards
- **Economic Calendar** — Upcoming high-impact macro events and corporate earnings dates
- **Forex** — Live currency pairs with trend, RSI, and technical signals
- **Commodities** — Gold, Silver, Crude Oil, Natural Gas, and Agricultural commodities live tracking
- **Crypto** — Top cryptocurrencies with on-chain indicators and dominance metrics
- **Fixed Income** — Bond market dashboard with duration, convexity, and spread analysis
- **Sector Analysis** — Deep sectoral breakdowns with relative strength rankings

### Notifications

- **Telegram Integration** — Connect any Telegram bot to receive automated market intelligence
- **Scheduled Digests** — Automatically delivered reports at your chosen interval (hourly / daily / weekly) covering top movers, portfolio alerts, and breaking macro news
- **Instant Alerts** — Trigger an on-demand market digest or test notification from the UI at any time
- **Status Dashboard** — Live view of notification configuration and last delivery time

### Multi-Language Support

PortAI supports **19 languages** covering all major Indian and global languages, powered by Google Translate with a fully custom-built switcher UI (no default Google widget shown). Language preference is persisted across page navigations.

| Indian Languages | Global Languages |
|---|---|
| Hindi (हिन्दी) | Chinese (中文) |
| Bengali (বাংলা) | Japanese (日本語) |
| Telugu (తెలుగు) | Korean (한국어) |
| Marathi (मराठी) | Arabic (العربية) |
| Tamil (தமிழ்) | Spanish (Español) |
| Gujarati (ગુજરાતી) | French (Français) |
| Kannada (ಕನ್ನಡ) | German (Deutsch) |
| Malayalam (മലയാളം) | Portuguese (Português) |
| Punjabi (ਪੰਜਾਬੀ) | Russian (Русский) |

---

## Project Structure

```
portai4/
├── backend/
│   └── app/
│       ├── main.py                      # FastAPI app — all API endpoints
│       ├── services/
│       │   ├── ai_intelligence.py       # LLM-powered stock analysis
│       │   ├── market_data.py           # yfinance data layer
│       │   ├── portfolio_analysis.py    # Risk metrics & analytics
│       │   ├── multi_agents.py          # Agent orchestration layer
│       │   ├── notification_service.py  # Telegram digest service
│       │   └── broker_service.py        # Broker API connectivity
│       └── stratton/
│           └── src/
│               ├── agents/              # 15+ investor persona agents
│               │   ├── buffett.py       # Warren Buffett persona
│               │   ├── munger.py        # Charlie Munger persona
│               │   ├── graham.py        # Benjamin Graham persona
│               │   ├── jhunjhunwala.py  # Rakesh Jhunjhunwala persona
│               │   ├── pabrai.py        # Mohnish Pabrai persona
│               │   ├── damodaran.py     # Aswath Damodaran persona
│               │   ├── druckenmiller.py # Stanley Druckenmiller persona
│               │   ├── burry.py         # Michael Burry persona
│               │   ├── wood.py          # Cathie Wood persona
│               │   └── ...              # + 6 more specialist agents
│               ├── backtest/            # Backtesting engine
│               ├── paper_trading/       # Paper trading simulation engine
│               ├── risk/                # Risk management modules
│               ├── graph/               # LangGraph agent graph orchestration
│               └── screener.py          # AI-powered stock screener
│
└── frontend/
    ├── app/                             # Next.js App Router (40+ pages)
    │   ├── page.tsx                     # Home / Live Markets
    │   ├── hedge-fund/                  # Stratton Engine dashboard
    │   ├── technical-charts/            # Advanced charting suite
    │   ├── intelligence/                # AI multi-agent analyst
    │   ├── portfolios/                  # Portfolio tools hub
    │   ├── sectors/                     # Sector analysis
    │   ├── equities-screener/           # Stock screener
    │   └── ...                          # 30+ more feature pages
    ├── components/
    │   ├── AdvancedChart.tsx            # Lightweight Charts v5 — full chart
    │   ├── CandleMiniChart.tsx          # Compact candlestick for positions
    │   ├── MiniChart.tsx                # Area spark-chart for watchlists
    │   ├── LanguageSwitcher.tsx         # 19-language custom switcher
    │   └── Header.tsx                   # Global navigation bar
    └── context/
        └── AuthContext.tsx              # Supabase auth provider
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Supabase project (for authentication)
- OpenAI or Anthropic API key (for AI agents)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`, connecting to the backend at `http://localhost:8000`.

### Environment Variables

**Backend** (`backend/.env`):
```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=...
TELEGRAM_BOT_TOKEN=...        # optional, for notification alerts
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Team

Built with passion for Indian retail investors by:

| Name | Contribution |
|---|---|
| **Avi Shukla** | Full Stack & AI Systems |
| **Chittransh Sharma** | Backend & Data Engineering |
| **Pratham Singh Shaurya** | Frontend & UI/UX |
| **Nakul Falswal** | Quant Research & Analytics |

---

> PortAI is built for educational and informational purposes. Nothing on this platform constitutes financial advice. Always conduct your own research before making investment decisions.
