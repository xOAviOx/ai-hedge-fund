'use client';

import React, { useId } from 'react';

interface StockChartProps {
  data: { date: string; close: number }[];
  label?: string;
  color?: string;
  height?: number;
}

/**
 * Dependency-free SVG area/line chart.
 *
 * Phase 1 note: this replaces the previous chart.js/react-chartjs-2 implementation
 * (both removed in the demolition dep-prune). Same props, no external chart lib.
 * A richer chart is provided by the lightweight-charts based components
 * (AdvancedChart / CandleMiniChart) which the rebuilt pages use in later phases.
 */
export default function StockChart({ data, color = '#3b82f6', height = 200 }: StockChartProps) {
  const gradientId = useId();
  const points = (data ?? []).map((d) => d.close).filter((v) => typeof v === 'number' && !isNaN(v));

  if (points.length < 2) {
    return (
      <div style={{ height: `${height}px` }} className="w-full flex items-center justify-center text-white/20 text-xs uppercase tracking-widest">
        No chart data
      </div>
    );
  }

  const W = 600;
  const H = height;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = (W - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - min) / span);

  const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * stepX} ${y(v)}`).join(' ');
  const areaPath = `${linePath} L ${pad + (points.length - 1) * stepX} ${H - pad} L ${pad} ${H - pad} Z`;

  return (
    <div style={{ height: `${height}px` }} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Price trend">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
