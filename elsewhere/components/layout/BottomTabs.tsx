"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, Bookmark, CircleUserRound, Users } from "lucide-react";

const tabs = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/map", label: "Map", icon: Map },
  { href: "/social", label: "Social", icon: Users },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
] as const;

export function BottomTabs() {
  const pathname = usePathname();
  const isPlaceDetail = pathname?.startsWith("/places/") ?? false;
  const [visualViewportBottomOffset, setVisualViewportBottomOffset] =
    useState(0);
  const [hasVisualViewport, setHasVisualViewport] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    setHasVisualViewport(true);

    const sync = () => {
      const offset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      setVisualViewportBottomOffset(Math.round(offset));
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  const collapsedToolbarBottomPadding =
    hasVisualViewport && visualViewportBottomOffset <= 1 ? 10 : 0;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-surface-alt bg-surface lg:hidden"
      style={{
        height: 56 + collapsedToolbarBottomPadding,
        paddingBottom: collapsedToolbarBottomPadding,
        transform: `translateY(-${visualViewportBottomOffset}px)`,
      }}
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
