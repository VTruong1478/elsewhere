'use client';

import { usePathname } from 'next/navigation';
import { TopNav } from '@/components/layout/TopNav';

/**
 * Mobile/tablet top nav that can be suppressed for specific routes.
 * Desktop header stays in `app/(app)/layout.tsx`.
 */
export function RouteTopNav() {
  const pathname = usePathname();

  // Be robust to basePath deployments (e.g. `/elsewhere/map`).
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const lastSegment = segments.at(-1);
  const penultimateSegment = segments.at(-2);

  // On the map tab we want the map to use the full vertical space.
  if (lastSegment === "map") return null;

  // On place detail screens we also want to remove the top nav
  // so the map background + bottom sheet can use the full height.
  if (penultimateSegment === "places") return null;

  return <TopNav />;
}

