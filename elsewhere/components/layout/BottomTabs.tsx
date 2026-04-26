"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, Bookmark, CircleUserRound } from "lucide-react";

const tabs = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/map", label: "Map", icon: Map },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
] as const;

export function BottomTabs() {
  const pathname = usePathname();
  const isPlaceDetail = pathname?.startsWith("/places/") ?? false;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-surface-alt bg-surface pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      style={{ minHeight: "calc(56px + env(safe-area-inset-bottom,0px))" }}
      role="tablist"
      suppressHydrationWarning
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        // When the place detail bottom sheet is open (places/[id]), keep the
        // map tab visually selected (mobile/tablet only).
        const isActive =
          href === "/map" ? pathname === "/map" || isPlaceDetail : pathname === href;
        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={isActive}
            className="relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1"
          >
            {isActive && (
              <span
                className="pointer-events-none absolute inset-0"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.15)" }}
                aria-hidden
              />
            )}
            <Icon
              size={20}
              className={`relative ${isActive ? "text-primary" : "text-text-tertiary"}`}
              aria-hidden
            />
            <span
              className={`relative text-ui-label-s ${isActive ? "text-primary" : "text-text-tertiary"}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
