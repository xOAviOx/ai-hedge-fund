// React Query hooks — the single data-fetching layer for the app.
// refetchInterval matches backend cache TTLs (quotes 60s) so we never poll faster
// than the cache updates (per TRANSFORM.md §4.7). No bare fetch-in-useEffect anywhere.

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api';
import type { FundConfigPatch } from './types';

const QUOTE_REFETCH = 60_000; // matches quote cache TTL

export const qk = {
  fund: ['fund'] as const,
  positions: ['positions'] as const,
  orders: (limit: number) => ['orders', limit] as const,
  nav: (limit: number) => ['nav', limit] as const,
  runs: (limit: number) => ['runs', limit] as const,
  run: (id: string) => ['run', id] as const,
  research: (t: string, memo: boolean) => ['research', t, memo] as const,
  risk: ['risk'] as const,
  stats: ['stats'] as const,
  quote: (s: string) => ['quote', s] as const,
  ohlcv: (s: string, i: string) => ['ohlcv', s, i] as const,
  news: (s: string) => ['news', s] as const,
  details: (s: string) => ['details', s] as const,
};

export const useFund = () => useQuery({ queryKey: qk.fund, queryFn: api.fund });

export const usePositions = () =>
  useQuery({ queryKey: qk.positions, queryFn: api.positions, refetchInterval: QUOTE_REFETCH });

export const useOrders = (limit = 50) =>
  useQuery({ queryKey: qk.orders(limit), queryFn: () => api.orders(limit) });

export const useNavHistory = (limit = 365) =>
  useQuery({ queryKey: qk.nav(limit), queryFn: () => api.navHistory(limit) });

export const useRuns = (limit = 50) =>
  useQuery({ queryKey: qk.runs(limit), queryFn: () => api.runs(limit) });

export const useRun = (id: string) =>
  useQuery({ queryKey: qk.run(id), queryFn: () => api.run(id), enabled: !!id });

export const useResearch = (ticker: string, includeMemo: boolean, enabled: boolean) =>
  useQuery({
    queryKey: qk.research(ticker, includeMemo),
    queryFn: () => api.research(ticker, includeMemo),
    enabled: enabled && !!ticker,
    staleTime: 5 * 60_000, // analysis is cached per (tickers, date) server-side too
  });

export const useRisk = () => useQuery({ queryKey: qk.risk, queryFn: api.risk });

export const useStats = () =>
  useQuery({ queryKey: qk.stats, queryFn: api.stats, refetchInterval: QUOTE_REFETCH });

export const useQuote = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.quote(symbol),
    queryFn: () => api.quote(symbol),
    enabled: enabled && !!symbol,
    refetchInterval: QUOTE_REFETCH,
  });

export const useOhlcv = (symbol: string, interval = '1d', enabled = true) =>
  useQuery({
    queryKey: qk.ohlcv(symbol, interval),
    queryFn: () => api.ohlcv(symbol, interval),
    enabled: enabled && !!symbol,
  });

export const useNews = (symbol: string, enabled = true) =>
  useQuery({ queryKey: qk.news(symbol), queryFn: () => api.news(symbol), enabled: enabled && !!symbol });

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

// ~6 weeks of daily closes for per-position sparklines (small, long-cached).
export const useSparkline = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: ['spark', symbol],
    queryFn: () => api.ohlcv(symbol, '1d', isoDaysAgo(42)),
    enabled: enabled && !!symbol,
    staleTime: 60 * 60_000,
  });

// Benchmark series aligned to the fund's NAV window (rebased in the chart).
export const useBenchmark = (symbol: string, startIso: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['benchmark', symbol, startIso ?? ''],
    queryFn: () => api.ohlcv(symbol, '1d', startIso ? startIso.slice(0, 10) : isoDaysAgo(365)),
    enabled: enabled && !!symbol,
    staleTime: 30 * 60_000,
  });

export const useDetails = (symbol: string, enabled = true) =>
  useQuery({ queryKey: qk.details(symbol), queryFn: () => api.details(symbol), enabled: enabled && !!symbol });

// ── mutations ─────────────────────────────────────────────────────────
export function useRunNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.runNow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.fund });
      qc.invalidateQueries({ queryKey: qk.positions });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['nav'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: qk.risk });
    },
  });
}

export function useTogglePause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pause: boolean) => (pause ? api.pause() : api.resume()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.fund }),
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: FundConfigPatch) => api.updateConfig(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.fund }),
  });
}
