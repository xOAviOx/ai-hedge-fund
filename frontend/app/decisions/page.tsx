'use client';

import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';

import { useRuns } from '@/lib/hooks';
import { dateTime, num, relativeTime, tickerLabel } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { Badge, Empty, ErrorState, Loading, Panel } from '@/components/ui';

export default function DecisionsPage() {
  const runs = useRuns(100);

  return (
    <div>
      <PageHeader title="Decision Room" subtitle="Every fund run, fully auditable — agents, orders, and memo." />
      <div className="p-6">
        <Panel title={`Runs (${runs.data?.length ?? 0})`} bodyClassName="p-0">
          {runs.isLoading ? (
            <Loading label="Loading runs" />
          ) : runs.isError ? (
            <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
          ) : !runs.data?.length ? (
            <Empty>No runs yet. Trigger one from the Fund Console with “Run now”.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {runs.data.map((r) => (
                <li key={r.run_id}>
                  <Link
                    href={`/decisions/${r.run_id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-ink">{dateTime(r.ts)}</span>
                        <span className="text-2xs text-muted">{relativeTime(r.ts)}</span>
                        {r.has_memo && (
                          <Badge tone="accent">
                            <FileText size={10} className="mr-1" /> memo
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {r.universe.slice(0, 8).map((t) => (
                          <span key={t} className="tnum text-2xs text-muted">
                            {tickerLabel(t)}
                          </span>
                        ))}
                        {r.universe.length > 8 && (
                          <span className="text-2xs text-muted">+{r.universe.length - 8}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-5 text-right">
                      <div>
                        <div className="tnum text-[13px] text-ink">{r.order_count}</div>
                        <div className="label">orders</div>
                      </div>
                      <div>
                        <div className="tnum text-[13px] text-ink">{num(r.latency_ms / 1000, 2)}s</div>
                        <div className="label">latency</div>
                      </div>
                      <ChevronRight size={16} className="text-muted" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
