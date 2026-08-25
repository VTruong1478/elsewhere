/**
 * MatchRing — percentage score inside a circular ring.
 * Uses SVG for precise 4px stroke. Ring color from score:
 * 70–100 High (green), 50–69 Medium (yellow), 0–49 Low (red).
 * Hex values from tailwind.config.js theme.extend.colors.
 */
const SVG_COLORS = {
  "status-high": "#4F5D3F" /* green */,
  "status-medium": "#C4943A" /* yellow */,
  "status-low": "#A85C3A" /* orange/red */,
} as const;

interface MatchRingProps {
  /**
   * Score 0–100; ring color: 70–100 green, 50–69 yellow, 0–49 orange/red.
   *
   * `null` means the place has no community ratings yet — there is no score to
   * show. Callers must pass the raw value through: coercing null to 0 painted
   * a red "0%" on every unrated place, which reads as "bad match" rather than
   * "no data yet".
   */
  score: number | null;
}

function getRingColor(score: number): string {
  if (score >= 70) return SVG_COLORS["status-high"]; /* 70–100: green */
  if (score >= 50) return SVG_COLORS["status-medium"]; /* 50–69: yellow */
  return SVG_COLORS["status-low"]; /* 0–49: red */
}

const SIZE = 48;
const STROKE = 4;
/** Radius so 4px stroke stays inside 48px (stroke center at 22, outer at 24). */
const R = SIZE / 2 - STROKE / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function MatchRing({ score }: MatchRingProps) {
  if (score == null || Number.isNaN(score)) {
    return (
      <div
        role="img"
        className="relative flex h-[48px] w-[48px] items-center justify-center rounded-full bg-surface"
        aria-label="Not rated yet"
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute"
          aria-hidden
        >
          {/* Track only — no progress arc, so nothing implies a low score. */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-surface-alt"
          />
        </svg>
        <span
          className="relative z-10 text-center text-ui-label-s text-text-secondary"
          aria-hidden
        >
          New
        </span>
      </div>
    );
  }

  const clamped = Math.min(100, Math.max(0, score));
  const strokeDashoffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const color = getRingColor(clamped);

  return (
    <div
      role="img"
      className="relative flex h-[48px] w-[48px] items-center justify-center rounded-full bg-surface"
      aria-label={`${Math.round(clamped)}% match`}
    >
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
      <span
        className="relative z-10 text-center text-ui-label-s text-text"
        aria-hidden
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
