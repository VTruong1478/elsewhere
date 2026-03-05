/**
 * Hex values from tailwind.config.js theme.extend.colors.
 * Used for SVG stroke/fill where Tailwind classes cannot be applied.
 */
const SVG_COLORS = {
  primary: '#4F5D3F',
  'status-medium': '#C4943A',
  'status-low': '#A85C3A',
} as const;

interface MatchRingProps {
  percent: number;
}

function getRingColor(percent: number): string {
  if (percent >= 80) return SVG_COLORS.primary;
  if (percent >= 50) return SVG_COLORS['status-medium'];
  return SVG_COLORS['status-low'];
}

const SIZE = 40;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function MatchRing({ percent }: MatchRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const strokeDashoffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const color = getRingColor(clamped);

  return (
    <div className="relative inline-flex h-40 w-40 items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute rotate-[-90deg]"
        aria-hidden
      >
        {/* White inner fill so percentage text sits on white */}
        <circle cx={CX} cy={CY} r={R - STROKE} fill="currentColor" className="text-text-inverse" />
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-surface-alt"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-ui-label-s font-bold text-text relative z-10">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
