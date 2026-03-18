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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex min-h-[56px] items-center justify-around border-t border-surface-alt bg-surface z-40 lg:hidden"
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
              className={`relative ${isActive ? "text-primary" : "text-text-secondary"}`}
              aria-hidden
            />
            <span
              className={`relative text-ui-label-s ${isActive ? "text-primary" : "text-text-secondary"}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
