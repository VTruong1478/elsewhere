'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MapPin, List } from 'lucide-react';

export function BottomTabs() {
  const pathname = usePathname();
  const feedActive = pathname === '/feed';

  return (
    <nav
      className="flex shrink-0 items-center justify-around border-t border-surface-alt bg-surface safe-area-pb z-40"
      role="tablist"
    >
      <Link
        href="/feed"
        role="tab"
        aria-selected={feedActive}
        className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 ${
          feedActive ? 'relative' : ''
        }`}
      >
        {feedActive && (
          <span
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
            aria-hidden
          />
        )}
        <List size={20} className="relative text-text" aria-hidden />
        <span className="relative text-ui-caption text-text">Feed</span>
      </Link>
      <Link
        href="/feed"
        role="tab"
        aria-selected={!feedActive}
        className="flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 text-text-secondary"
      >
        <MapPin size={20} aria-hidden />
        <span className="text-ui-caption">Map</span>
      </Link>
    </nav>
  );
}
