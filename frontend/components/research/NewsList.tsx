'use client';

import { ExternalLink } from 'lucide-react';

import type { NewsItem } from '@/lib/types';
import { relativeTime } from '@/lib/format';
import { Empty } from '@/components/ui';

export default function NewsList({ items }: { items: NewsItem[] }) {
  if (!items.length) return <Empty>No recent news.</Empty>;
  return (
    <ul className="divide-y divide-line/60">
      {items.map((n, i) => (
        <li key={`${n.link ?? n.title}-${i}`} className="px-4 py-3">
          <a
            href={n.link ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-[13px] leading-snug text-ink group-hover:text-accent">{n.title}</div>
              <div className="mt-1 flex items-center gap-2 text-2xs text-muted">
                {n.publisher && <span>{n.publisher}</span>}
                {n.published && <span>· {relativeTime(n.published)}</span>}
              </div>
            </div>
            {n.link && <ExternalLink size={13} className="mt-0.5 shrink-0 text-muted group-hover:text-accent" />}
          </a>
        </li>
      ))}
    </ul>
  );
}
