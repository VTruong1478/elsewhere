'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Bookmark, CircleUser } from 'lucide-react';

export function TopNav() {
  const pathname = usePathname();
  const feedActive = pathname === '/feed';
  const savedActive = pathname === '/saved';

  return (
    <header
      className="relative flex h-[56px] w-full shrink-0 items-center bg-primary px-16 z-40"
    >
      <Link
        href="/feed"
        className="font-lora text-heading-s text-text-inverse flex shrink-0 items-center"
      >
        elsewhere
      </Link>
      <nav
        className="absolute left-1/2 flex -translate-x-1/2 items-center gap-8"
        role="navigation"
      >
        <Link
          href="/feed"
          className="relative flex min-h-[44px] min-w-[44px] items-center justify-center gap-8 rounded-radius-sm text-ui-label-m text-text-inverse"
        >
          {feedActive && (
            <span className="pointer-events-none absolute inset-0 rounded-radius-sm bg-white/15" aria-hidden />
          )}
          <Home size={20} className="relative" aria-hidden />
          <span className="relative">Feed</span>
        </Link>
        <Link
          href="/saved"
          className="relative flex min-h-[44px] min-w-[44px] items-center justify-center gap-8 rounded-radius-sm text-ui-label-m text-text-inverse"
        >
          {savedActive && (
            <span className="pointer-events-none absolute inset-0 rounded-radius-sm bg-white/15" aria-hidden />
          )}
          <Bookmark size={20} className="relative" aria-hidden />
          <span className="relative">Saved</span>
        </Link>
      </nav>
      <Link
        href="/profile"
        className="ml-auto flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-ui-label-m text-text-inverse"
      >
        <CircleUser size={24} aria-hidden />
      </Link>
    </header>
  );
}
