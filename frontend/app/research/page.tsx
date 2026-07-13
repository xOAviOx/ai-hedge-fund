'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';

import { useFund } from '@/lib/hooks';
import { tickerLabel } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { Panel } from '@/components/ui';

export default function ResearchPage() {
  const [q, setQ] = useState('');
  const router = useRouter();
  const fund = useFund();

  const go = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (s) router.push(`/research/${encodeURIComponent(s)}`);
  };

  return (
    <div>
      <PageHeader title="Research Terminal" subtitle="Run the full agent pipeline on any NSE or US ticker." />
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          className="relative"
        >
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a ticker — e.g. RELIANCE, TCS, AAPL"
            className="w-full rounded-md border border-line bg-panel py-3 pl-10 pr-24 text-sm text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Analyse
          </button>
        </form>

        <p className="text-2xs text-muted">
          Bare tickers resolve to NSE (RELIANCE → RELIANCE.NS). US megacaps and ETFs pass through. The full pipeline
          runs live; a repeat lookup the same day is served from cache.
        </p>

        <Panel title="Fund universe" bodyClassName="p-4">
          {fund.data ? (
            <div className="flex flex-wrap gap-2">
              {fund.data.universe.map((t) => (
                <Link
                  key={t}
                  href={`/research/${encodeURIComponent(t)}`}
                  className="tnum rounded border border-line bg-panel2 px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {tickerLabel(t)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">Loading universe…</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
