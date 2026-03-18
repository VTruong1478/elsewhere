/**
 * MatchRing — percentage score inside a circular ring.
 * Uses SVG for precise 4px stroke. Ring color from score:
 * 80–100 High (green), 60–79 Medium (yellow), 0–59 Low (orange/red).
 * Hex values from tailwind.config.js theme.extend.colors.
 */
const SVG_COLORS = {
  "status-high": "#4F5D3F" /* green */,
  "status-medium": "#C4943A" /* yellow */,
  "status-low": "#A85C3A" /* orange/red */,
} as const;

interface MatchRingProps {
  /** Score 0–100; ring color: 80–100 green, 60–79 yellow, 0–59 orange/red. */
  score: number;
}

function getRingColor(score: number): string {
  if (score >= 80) return SVG_COLORS["status-high"]; /* 80–100: green */
  if (score >= 60) return SVG_COLORS["status-medium"]; /* 60–79: yellow */
  return SVG_COLORS["status-low"]; /* 0–59: orange/red */
}

const SIZE = 48;
const STROKE = 4;
/** Radius so 4px stroke stays inside 48px (stroke center at 22, outer at 24). */
const R = SIZE / 2 - STROKE / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function MatchRing({ score }: MatchRingProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const strokeDashoffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const color = getRingColor(clamped);

  return (
    <div className="relative flex h-[48px] w-[48px] items-center justify-center rounded-full bg-surface">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute rotate-[-90deg]"
        aria-hidden
      >
        {/* Track: full circle, subtle stroke */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-surface-alt"
        />
        {/* Progress arc */}
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
      <span className="relative z-10 text-center text-ui-label-s text-text">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
