'use client';

import { useEffect, useState } from 'react';

function fmtDelta(ms: number): string {
  if (ms <= 0) return 'due now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function NextRun({ nextRunTime, fallback }: { nextRunTime: string | null; fallback: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!nextRunTime) {
    return (
      <div className="flex flex-col gap-1">
        <span className="label">Next run</span>
        <span className="tnum text-sm text-muted">{fallback}</span>
      </div>
    );
  }
  const target = new Date(nextRunTime).getTime();
  return (
    <div className="flex flex-col gap-1">
      <span className="label">Next scheduled run</span>
      <span className="tnum text-sm font-medium text-ink">{fmtDelta(target - now)}</span>
    </div>
  );
}
