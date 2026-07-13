'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';

import { useDetails, useNews, useOhlcv, useQuote, useResearch } from '@/lib/hooks';
import { money, pct, signClass, tickerLabel } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { ErrorState, Loading, Panel } from '@/components/ui';
import PriceChart from '@/components/charts/PriceChart';
import AgentPanel from '@/components/research/AgentPanel';
import NewsList from '@/components/research/NewsList';
import Fundamentals from '@/components/research/Fundamentals';

export default function TickerResearchPage({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker);
  const [withThesis, setWithThesis] = useState(false);

  const quote = useQuote(ticker);
  const ohlcv = useOhlcv(ticker, '1d');
  const details = useDetails(ticker);
  const news = useNews(ticker);
  const research = useResearch(ticker, withThesis, true);

  const q = quote.data;

  return (
    <div>
      <PageHeader
        title={tickerLabel(ticker)}
        subtitle={
          q ? (
            <span className="tnum">
              {money(q.price, q.currency)}{' '}
              <span className={signClass(q.change_pct)}>{pct(q.change_pct)}</span>
            </span>
          ) : (
            'Research Terminal'
          )
        }
        actions={
          <>
            <button
              onClick={() => setWithThesis(true)}
              disabled={withThesis}
              className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-50"
            >
              <Sparkles size={14} /> {withThesis ? 'Thesis requested' : 'Generate thesis'}
            </button>
            <Link
              href="/research"
              className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-ink"
            >
              <ArrowLeft size={14} /> Search
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        {/* Left: chart, fundamentals, news */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Price — 1Y daily" bodyClassName="p-4">
            {ohlcv.isLoading ? (
              <Loading label="Loading prices" />
            ) : ohlcv.isError ? (
              <ErrorState error={ohlcv.error} onRetry={() => ohlcv.refetch()} />
            ) : ohlcv.data && ohlcv.data.bars.length ? (
              <PriceChart bars={ohlcv.data.bars} />
            ) : (
              <div className="py-12 text-center text-sm text-muted">No price data for this symbol.</div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Panel title="Fundamentals" bodyClassName="p-0">
              {details.isLoading ? <Loading label="Loading" /> : <Fundamentals details={details.data ?? null} />}
            </Panel>
            <Panel title="Recent news" bodyClassName="p-0">
              {news.isLoading ? (
                <Loading label="Loading news" />
              ) : (
                <NewsList items={news.data?.items ?? []} />
              )}
            </Panel>
          </div>
        </div>

        {/* Right: agent debate */}
        <div className="lg:col-span-1">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="label">Agent analysis</span>
            {research.isFetching && <span className="text-2xs text-muted">running…</span>}
          </div>
          {research.isLoading ? (
            <Panel bodyClassName="p-0">
              <Loading label="Running the pipeline" />
            </Panel>
          ) : research.isError ? (
            <Panel bodyClassName="p-4">
              <ErrorState error={research.error} onRetry={() => research.refetch()} />
            </Panel>
          ) : research.data ? (
            <AgentPanel result={research.data} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
