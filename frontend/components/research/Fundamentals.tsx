'use client';

import type { TickerDetails } from '@/lib/types';
import { moneyCompact, num } from '@/lib/format';
import { Empty } from '@/components/ui';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="flex items-center justify-between border-b border-line/50 py-2 last:border-0">
      <span className="text-2xs uppercase tracking-wider text-muted">{label}</span>
      <span className="tnum text-[13px] text-ink">{value}</span>
    </div>
  );
}

export default function Fundamentals({ details }: { details: TickerDetails | null }) {
  if (!details) return <Empty>No fundamentals available.</Empty>;
  return (
    <div className="px-4 pb-4">
      {details.name && <div className="mb-2 py-2 text-sm font-medium text-ink">{details.name}</div>}
      <Row label="Sector" value={details.sector} />
      <Row label="Industry" value={details.industry} />
      <Row label="Exchange" value={details.exchange} />
      <Row
        label="Market cap"
        value={details.market_cap != null ? moneyCompact(details.market_cap, details.currency) : null}
      />
      <Row
        label="Shares out"
        value={details.shares_outstanding != null ? num(details.shares_outstanding, 0) : null}
      />
      <Row label="Employees" value={details.employees != null ? num(details.employees, 0) : null} />
      {details.description && (
        <p className="mt-3 text-2xs leading-relaxed text-muted line-clamp-6">{details.description}</p>
      )}
    </div>
  );
}
