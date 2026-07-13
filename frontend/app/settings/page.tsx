'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import { useFund, useUpdateConfig } from '@/lib/hooks';
import { useAuth } from '@/context/AuthContext';
import { cron, tickerLabel } from '@/lib/format';
import { PERSONA_KEYS, PERSONAS } from '@/lib/personas';
import type { FundConfigPatch } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { ErrorState, Loading, Panel } from '@/components/ui';

export default function SettingsPage() {
  const fund = useFund();
  const update = useUpdateConfig();
  const { user, signOut } = useAuth();

  const [universe, setUniverse] = useState('');
  const [cap, setCap] = useState('30');
  const [schedule, setSchedule] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [personas, setPersonas] = useState<Set<string>>(new Set());

  // Seed the form once the fund loads.
  useEffect(() => {
    if (!fund.data) return;
    const f = fund.data;
    setUniverse(f.universe.join(', '));
    setCap(String(f.position_cap_pct));
    setSchedule(f.schedule_cron);
    setCurrency(f.base_currency);
    const active = f.active_personas.filter((p) => p !== 'all');
    setPersonas(new Set(active.length ? active : PERSONA_KEYS));
  }, [fund.data]);

  const allSelected = personas.size === PERSONA_KEYS.length;
  const parsedUniverse = useMemo(
    () => universe.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
    [universe],
  );

  const togglePersona = (key: string) =>
    setPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = () => {
    const patch: FundConfigPatch = {
      universe: parsedUniverse,
      position_cap_pct: Number(cap) || 0,
      schedule_cron: schedule.trim(),
      base_currency: currency,
      // empty list => backend runs all personas
      active_personas: allSelected ? [] : PERSONA_KEYS.filter((k) => personas.has(k)),
    };
    update.mutate(patch);
  };

  if (fund.isLoading) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Fund configuration." />
        <Loading label="Loading configuration" />
      </div>
    );
  }
  if (fund.isError || !fund.data) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Fund configuration." />
        <ErrorState error={fund.error} onRetry={() => fund.refetch()} />
      </div>
    );
  }

  const inputClass =
    'w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none';

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Fund configuration — universe, sizing, schedule, and active personas."
        actions={
          <button
            onClick={save}
            disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save changes
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <Panel title="Fund configuration" bodyClassName="space-y-4 p-4">
          <div>
            <label className="label mb-1.5 block">Universe</label>
            <textarea
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              rows={3}
              className={`${inputClass} tnum resize-y`}
              placeholder="RELIANCE.NS, TCS.NS, AAPL"
            />
            <p className="mt-1 text-2xs text-muted">
              {parsedUniverse.length} tickers · bare symbols resolve to NSE on save.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label mb-1.5 block">Position cap (%)</label>
              <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className={`${inputClass} tnum`} />
            </div>
            <div>
              <label className="label mb-1.5 block">Base currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                <option value="INR">INR — ₹</option>
                <option value="USD">USD — $</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label mb-1.5 block">Schedule (cron)</label>
            <input value={schedule} onChange={(e) => setSchedule(e.target.value)} className={`${inputClass} tnum`} />
            <p className="mt-1 text-2xs text-muted">{cron(schedule)} · default 15:45 IST after NSE close, weekdays.</p>
          </div>

          {update.isError && (
            <div className="rounded-md border border-down/25 bg-down/10 px-3 py-2 text-2xs text-down">
              Save failed: {update.error instanceof Error ? update.error.message : 'unknown error'}
            </div>
          )}
          {update.isSuccess && !update.isPending && (
            <div className="rounded-md border border-up/25 bg-up/10 px-3 py-2 text-2xs text-up">Configuration saved.</div>
          )}
        </Panel>

        <Panel
          title="Active personas"
          right={
            <button
              onClick={() => setPersonas(new Set(allSelected ? [] : PERSONA_KEYS))}
              className="text-2xs text-accent hover:underline"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          }
          bodyClassName="p-2"
        >
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {PERSONAS.map((p) => {
              const on = personas.has(p.key);
              return (
                <button
                  key={p.key}
                  onClick={() => togglePersona(p.key)}
                  className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors ${
                    on ? 'border-accent/30 bg-accent/5' : 'border-line hover:bg-white/[0.03]'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? 'border-accent bg-accent text-white' : 'border-line'
                    }`}
                  >
                    {on && <Check size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] text-ink">{p.name}</span>
                    <span className="block truncate text-2xs text-muted">{p.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="px-2 pb-1 pt-2 text-2xs text-muted">
            {personas.size === 0
              ? 'None selected — the fund will run all personas.'
              : `${personas.size} of ${PERSONA_KEYS.length} personas active.`}
          </p>
        </Panel>

        <Panel title="Integrations" bodyClassName="space-y-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[13px] text-ink">Telegram memos</div>
              <p className="text-2xs text-muted">
                Configured on the backend via TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID. When set, the daily fund memo is
                pushed automatically after each run.
              </p>
            </div>
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-line pt-3">
            <div>
              <div className="text-[13px] text-ink">LLM provider</div>
              <p className="text-2xs text-muted">
                Set via backend env (LLM_PROVIDER / *_API_KEY). Without a key the pipeline still runs fully — memos are
                simply skipped.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Account" bodyClassName="space-y-3 p-4">
          {user ? (
            <>
              <div>
                <div className="label">Signed in as</div>
                <div className="text-[13px] text-ink">{user.email ?? user.id}</div>
              </div>
              <button
                onClick={() => signOut()}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-down"
              >
                Sign out
              </button>
            </>
          ) : (
            <p className="text-xs text-muted">
              Not signed in — the fund runs single-user by default (fund id “{fund.data.fund_id}”). Auth is optional.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
