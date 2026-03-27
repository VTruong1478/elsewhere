"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, Bookmark, CircleUser } from "lucide-react";

export type HeaderRoute = "feed" | "saved" | string;

export interface HeaderProps {
  /** Current route for highlighting the nav item */
  currentRoute?: HeaderRoute;
  /** Show the profile action on the right */
  showProfile?: boolean;
  className?: string;
}

const NAV_ITEMS: {
  route: "feed" | "map" | "saved";
  href: string;
  label: string;
  icon: typeof Home;
}[] = [
  { route: "feed", href: "/feed", label: "Feed", icon: Home },
  { route: "map", href: "/map", label: "Map", icon: MapPin },
  { route: "saved", href: "/saved", label: "Saved", icon: Bookmark },
];

function HeaderBrand() {
  return (
    <Link
      href="/feed"
      className="text-heading-xl text-text-inverse shrink-0"
      aria-label="Elsewhere home"
    >
      elsewhere
    </Link>
  );
}

function HeaderNavItem({
  href,
  label,
  icon: Icon,
  selected,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  selected: boolean;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex h-40 min-w-0 items-center gap-16 rounded-radius-sm px-12 py-8 text-ui-label-m text-text-inverse"
      aria-current={selected ? "page" : undefined}
    >
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-radius-sm bg-header-selected-overlay"
          aria-hidden
        />
      )}
      <Icon
        size={20}
        className="relative shrink-0 text-text-inverse"
        aria-hidden
      />
      <span className="relative">{label}</span>
    </Link>
  );
}

function HeaderNav({ currentRoute = "feed" }: { currentRoute?: HeaderRoute }) {
  return (
    <nav className="flex items-center justify-start gap-16" role="navigation">
      {NAV_ITEMS.map(({ route, href, label, icon }) => (
        <HeaderNavItem
          key={route}
          href={href}
          label={label}
          icon={icon}
          selected={currentRoute === route}
        />
      ))}
    </nav>
  );
}

function HeaderProfile() {
  return (
    <Link
      href="/profile"
      className="flex shrink-0 items-center gap-16 text-ui-label-m text-text-inverse"
      aria-label="Profile"
    >
      <span className="flex h-40 w-40 items-center justify-center rounded-full bg-header-selected-overlay">
        <CircleUser size={24} className="text-text-inverse" aria-hidden />
      </span>
      <span>Profile</span>
    </Link>
  );
}

export function Header({
  currentRoute,
  showProfile = true,
  className = "",
}: HeaderProps) {
  const pathname = usePathname();
  if (/^\/places\/[^/]+\/rate(?:\/|$)/.test(pathname ?? "")) {
    return null;
  }
  if (pathname === "/saved") {
    return null;
  }
  const route =
    currentRoute ??
    (pathname === "/saved" ? "saved" : pathname === "/map" ? "map" : "feed");

  return (
    <header
      className={`flex h-[88px] w-full shrink-0 items-center justify-between bg-header-bg px-24 py-24 z-40 ${className}`.trim()}
      role="banner"
    >
      <div className="flex items-center gap-24">
        <HeaderBrand />
        <HeaderNav currentRoute={route} />
      </div>
      <div className="flex items-center justify-end">
        {showProfile ? <HeaderProfile /> : <span />}
      </div>
    </header>
  );
}
