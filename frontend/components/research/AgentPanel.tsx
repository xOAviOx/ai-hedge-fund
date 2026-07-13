'use client';

import type { RawSignal, ResearchResult } from '@/lib/types';
import { displayForAgent, isPersona } from '@/lib/personas';
import { num } from '@/lib/format';
import { ActionPill, ConfidenceBar, DirectionPill } from '@/components/ui';

function SignalRows({ signals }: { signals: RawSignal[] }) {
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  return (
    <table className="w-full">
      <tbody>
        {sorted.map((s) => (
          <tr key={s.agent_id} className="border-b border-line/50 last:border-0">
            <td className="w-36 py-2 pr-3 align-top text-[13px] text-ink">{displayForAgent(s.agent_id)}</td>
            <td className="w-24 py-2 pr-3 align-top">
              <DirectionPill direction={s.signal} />
            </td>
            <td className="w-28 py-2 pr-3 align-top">
              <ConfidenceBar value={s.confidence} />
            </td>
            <td className="py-2 align-top text-2xs leading-relaxed text-muted">{s.reasoning || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AgentPanel({ result }: { result: ResearchResult }) {
  const all = Object.values(result.signals);
  const personas = all.filter((s) => isPersona(s.agent_id));
  const analysts = all.filter((s) => !isPersona(s.agent_id));
  const risk = result.risk;
  const order = result.order;

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <span className="label">Risk-adjusted consensus</span>
          {risk && <DirectionPill direction={risk.signal} />}
        </div>
        {risk ? (
          <div className="mt-3 flex items-center gap-6">
            <div>
              <div className="tnum text-2xl font-semibold text-ink">{Math.round(risk.confidence)}</div>
              <div className="label">confidence</div>
            </div>
            <div className="tnum flex items-center gap-3 text-sm">
              <span className="text-up">{risk.bull_count}▲ bull</span>
              <span className="text-down">{risk.bear_count}▼ bear</span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">No consensus computed.</p>
        )}
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <span className="label">PM decision</span>
          {order && order.action !== 'hold' ? (
            <span className="flex items-center gap-2 text-xs text-ink">
              <ActionPill action={order.action} />
              <span className="tnum">{num(order.quantity, 0)} sh</span>
              <span className="text-muted">— {order.reasoning || 'sized to risk'}</span>
            </span>
          ) : (
            <ActionPill action="hold" />
          )}
        </div>
      </div>

      {result.memo && (
        <div className="panel p-4">
          <div className="label mb-2">AI thesis</div>
          <div className="space-y-2 text-sm leading-relaxed text-ink/90">
            {result.memo
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {p}
                </p>
              ))}
          </div>
        </div>
      )}

      {personas.length > 0 && (
        <div className="panel p-4">
          <div className="label mb-1">Investor personas ({personas.length})</div>
          <SignalRows signals={personas} />
        </div>
      )}
      {analysts.length > 0 && (
        <div className="panel p-4">
          <div className="label mb-1">Analyst models ({analysts.length})</div>
          <SignalRows signals={analysts} />
        </div>
      )}
    </div>
  );
}
