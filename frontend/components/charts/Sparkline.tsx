'use client';

// Dependency-free SVG sparkline — used for per-position trend cells on the
// Fund Console. Coloured by net direction (first vs last), P&L palette only.

export default function Sparkline({
  data,
  width = 96,
  height = 28,
  strokeWidth = 1.5,
}: {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const pts = data.filter((n) => Number.isFinite(n));
  if (pts.length < 2) {
    return <div style={{ width, height }} className="rounded bg-white/5" />;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  const y = (v: number) => height - ((v - min) / span) * (height - 2) - 1;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  const color = up ? '#2ebd85' : '#f6465d';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
