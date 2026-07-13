'use client';

import Link from 'next/link';

// Phase 1 placeholder. Phase 5 replaces this route with the real Fund Console
// (NAV curve vs benchmark, live positions/P&L, today's orders, next-run countdown,
// kill-switch). Kept intentionally minimal and dependency-free during demolition.

const SURFACES = [
  { href: '/hedge-fund', label: 'Hedge Fund', desc: 'The Stratton Fund at a glance' },
  { href: '/intelligence', label: 'Intelligence', desc: 'On-demand ticker research' },
  { href: '/technical-charts', label: 'Charts', desc: 'Candlestick charts + indicators' },
  { href: '/paper-trading', label: 'Paper Trading', desc: 'The fund ledger' },
  { href: '/backtesting', label: 'Backtesting', desc: 'Point-in-time strategy runs' },
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 pt-32 pb-20 max-w-5xl mx-auto">
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-4">PortAI · Stratton Fund</p>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
        An AI-native paper hedge fund.
      </h1>
      <p className="text-white/60 max-w-2xl leading-relaxed mb-12">
        Agents research, debate, risk-manage, and paper-trade a real portfolio on a schedule —
        with every decision fully auditable. This surface is being rebuilt into the Fund Console.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="text-sm font-semibold mb-1 group-hover:text-blue-400 transition-colors">{s.label}</div>
            <div className="text-xs text-white/40">{s.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
