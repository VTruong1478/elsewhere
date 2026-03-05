'use client';

import { useEffect, useState } from 'react';

/**
 * Hex values from tailwind.config.js theme.extend.colors.
 * Used for SVG stroke/fill where Tailwind classes cannot be applied.
 */
/** Same tier colors as MatchRing (status-high, status-medium, status-low) */
const SVG_COLORS = {
  'status-high': '#4F5D3F',
  'status-medium': '#C4943A',
  'status-low': '#A85C3A',
} as const;

interface MapMarkerProps {
  percent: number;
  selected: boolean;
}

function getMarkerColor(percent: number): string {
  if (percent >= 80) return SVG_COLORS['status-high'];
  if (percent >= 60) return SVG_COLORS['status-medium'];
  return SVG_COLORS['status-low'];
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return prefersReducedMotion;
}

export function MapMarker({ percent, selected }: MapMarkerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const color = getMarkerColor(Math.min(100, Math.max(0, percent)));
  const scale = selected ? 1.15 : 1;

  return (
    <div
      className="inline-flex origin-bottom items-center justify-center"
      style={{
        transform: `scale(${scale})`,
        transition: reducedMotion ? 'none' : 'transform 0.2s ease-out',
      }}
    >
      {/* Teardrop pin: circle on top, triangle below */}
      <div className="relative inline-block">
        <svg
          width="32"
          height="40"
          viewBox="0 0 32 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24s16-14 16-24C32 7.163 24.837 0 16 0z"
            fill={color}
          />
        </svg>
        <div
          className="absolute left-0 top-0 flex h-[28px] w-full items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <span className="text-ui-label-s font-bold text-text-inverse">
            {Math.round(Math.min(100, Math.max(0, percent)))}
          </span>
        </div>
      </div>
    </div>
  );
}
