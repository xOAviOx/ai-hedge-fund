// Display formatting — currency, numbers, percentages, dates, symbols.
// The UI uses tabular-nums everywhere; these helpers keep number formatting
// consistent (INR-first, since the fund's base currency is INR).

const CCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

export function ccySymbol(currency?: string | null): string {
  return CCY_SYMBOL[(currency ?? 'INR').toUpperCase()] ?? '';
}

export function money(value: number | null | undefined, currency: string | null = 'INR', dp = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  const locale = (currency ?? 'INR').toUpperCase() === 'INR' ? 'en-IN' : 'en-US';
  return `${ccySymbol(currency)}${value.toLocaleString(locale, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

// Compact money for big NAV/market-cap figures: ₹10.4L, ₹1.2Cr, $3.1B.
export function moneyCompact(value: number | null | undefined, currency: string | null = 'INR'): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sym = ccySymbol(currency);
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if ((currency ?? 'INR').toUpperCase() === 'INR') {
    if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)}L`;
    return `${sign}${sym}${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  return `${sign}${sym}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function num(value: number | null | undefined, dp = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pct(value: number | null | undefined, dp = 2, withSign = true): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(dp)}%`;
}

export function signClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-muted';
  return value > 0 ? 'text-up' : 'text-down';
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// "RELIANCE.NS" -> "RELIANCE", "^NSEI" -> "NIFTY 50", "AAPL" -> "AAPL"
const INDEX_LABELS: Record<string, string> = {
  '^NSEI': 'NIFTY 50', '^BSESN': 'SENSEX', '^NSEBANK': 'BANK NIFTY', SPY: 'S&P 500',
};
export function tickerLabel(symbol: string): string {
  if (INDEX_LABELS[symbol]) return INDEX_LABELS[symbol];
  return symbol.replace(/\.(NS|BO)$/i, '');
}

// "buffett_analyst" -> "Buffett", "macro_regime_analyst" -> "Macro Regime"
export function agentLabel(agentId: string): string {
  return agentId
    .replace(/_analyst$/i, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function cron(expr: string): string {
  // Best-effort friendly rendering for the common "m h * * dow" fund schedule.
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [m, h, , , dow] = parts;
  const hh = h.padStart(2, '0');
  const mm = m.padStart(2, '0');
  const days = dow === 'mon-fri' ? 'weekdays' : dow === '*' ? 'every day' : dow;
  return `${hh}:${mm} · ${days}`;
}
