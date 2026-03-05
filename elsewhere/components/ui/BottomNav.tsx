'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map, Bookmark, User } from 'lucide-react';

const tabs = [
  { href: '/feed', label: 'Feed', icon: Home },
  { href: '/map', label: 'Map', icon: Map },
  { href: '/saved', label: 'Saved', icon: Bookmark },
  { href: '/profile', label: 'Profile', icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex shrink-0 items-center justify-around border-t border-surface-alt bg-surface"
      style={{ minHeight: '56px' }}
      role="tablist"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={isActive}
            className="relative flex min-h-[56px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0 py-8"
          >
            {isActive && (
              <span
                className="pointer-events-none absolute inset-0 bg-white/15"
                aria-hidden
              />
            )}
            <Icon
              size={20}
              className={`relative ${isActive ? 'text-primary' : 'text-text-secondary'}`}
              aria-hidden
            />
            <span
              className={`relative text-ui-label-s ${isActive ? 'text-primary' : 'text-text-secondary'}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
