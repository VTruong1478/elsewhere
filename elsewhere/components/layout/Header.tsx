"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Home, Bookmark, CircleUser, User2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasDevBypassCookieClient } from "@/lib/devAuthClient";
import {
  getHeaderFirstName,
  isDevTestAccountUser,
  isGoogleAuthUser,
} from "@/lib/authUserDisplay";

export type HeaderRoute = "feed" | "saved" | string;

export interface HeaderProps {
  /** Current route for highlighting the nav item */
  currentRoute?: HeaderRoute;
  /** Show the profile action on the right */
  showProfile?: boolean;
  className?: string;
}

const NAV_ITEMS: {
  route: "feed" | "saved";
  href: string;
  label: string;
  icon: typeof Home;
}[] = [
  { route: "feed", href: "/feed", label: "Feed", icon: Home },
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

function loginHrefFromPath(pathname: string | null): string {
  const p = pathname?.trim() || "";
  if (!p || p === "/login" || p === "/signup") return "/login";
  return `/login?next=${encodeURIComponent(p)}`;
}

/** Logged-out: link to login; label matches other nav rows (icon + text). */
function HeaderProfileLoggedOut({
  selected,
  href,
}: {
  selected: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="relative flex shrink-0 items-center gap-16 rounded-radius-sm px-12 py-8 text-ui-label-m text-text-inverse"
      aria-label="Log in"
      aria-current={selected ? "page" : undefined}
    >
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-radius-sm bg-header-selected-overlay"
          aria-hidden
        />
      )}
      <span className="flex items-center justify-center rounded-full">
        <CircleUser size={24} className="text-text-inverse" aria-hidden />
      </span>
      <span className="relative">Log in</span>
    </Link>
  );
}

/**
 * Dev bypass: no Supabase session on the client, but profile page shows "Dev User"
 * (see profile/page.tsx). Match that — User2 + "Dev", same circle as profile.
 */
function HeaderProfileDev({ selected }: { selected: boolean }) {
  return (
    <Link
      href="/profile"
      className="relative flex shrink-0 items-center gap-16 rounded-radius-sm px-12 py-8 text-ui-label-m text-text-inverse"
      aria-label="Dev"
      aria-current={selected ? "page" : undefined}
    >
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-radius-sm bg-header-selected-overlay"
          aria-hidden
        />
      )}
      <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt text-text shadow-map">
        <User2 size={16} className="text-primary" aria-hidden />
      </span>
      <span className="relative max-w-[120px] truncate">Dev</span>
    </Link>
  );
}

/**
 * Logged in: same avatar rules as /profile — `profiles.avatar_url` or User2.
 * Google users: first name; dev test account (email): "Dev"; others: "Profile".
 */
function HeaderProfileLoggedIn({
  selected,
  user,
  profileAvatarUrl,
}: {
  selected: boolean;
  user: User;
  profileAvatarUrl: string | null;
}) {
  const google = isGoogleAuthUser(user);
  const firstName = getHeaderFirstName(user);
  const label =
    google && firstName
      ? firstName
      : isDevTestAccountUser(user)
        ? "Dev"
        : "Profile";

  return (
    <Link
      href="/profile"
      className="relative flex shrink-0 items-center gap-16 rounded-radius-sm px-12 py-8 text-ui-label-m text-text-inverse"
      aria-label={label}
      aria-current={selected ? "page" : undefined}
    >
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-radius-sm bg-header-selected-overlay"
          aria-hidden
        />
      )}
      {/* 24×24 avatar (design spacing scale); img or User2 */}
      <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt text-text shadow-map">
        {profileAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same source as profile page
          <img
            src={profileAvatarUrl}
            alt=""
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <User2 size={16} className="text-primary" aria-hidden />
        )}
      </span>
      <span className="relative max-w-[120px] truncate">{label}</span>
    </Link>
  );
}

export function Header({
  currentRoute,
  showProfile = true,
  className = "",
}: HeaderProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [devBypassActive, setDevBypassActive] = useState(false);

  useLayoutEffect(() => {
    setDevBypassActive(hasDevBypassCookieClient());
  }, []);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfileAvatarUrl(null);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const url = data?.avatar_url;
        setProfileAvatarUrl(
          typeof url === "string" && url.trim() ? url.trim() : null,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (/^\/places\/[^/]+\/rate(?:\/|$)/.test(pathname ?? "")) {
    return null;
  }
  const isProfileRoute = pathname === "/profile";
  const isLoginRoute = pathname === "/login";
  const route =
    currentRoute ??
    (pathname === "/saved"
      ? "saved"
      : pathname === "/profile"
        ? "profile"
        : "feed");

  return (
    <header
      className={`flex h-[72px] w-full shrink-0 items-center justify-between bg-header-bg px-24 py-24 z-40 ${className}`.trim()}
      role="banner"
      suppressHydrationWarning
    >
      <div className="flex items-center gap-24">
        <HeaderBrand />
        <HeaderNav currentRoute={route} />
      </div>
      <div className="flex items-center justify-end">
        {showProfile ? (
          user ? (
            <HeaderProfileLoggedIn
              selected={isProfileRoute}
              user={user}
              profileAvatarUrl={profileAvatarUrl}
            />
          ) : devBypassActive ? (
            <HeaderProfileDev selected={isProfileRoute} />
          ) : (
            <HeaderProfileLoggedOut
              selected={isLoginRoute}
              href={loginHrefFromPath(pathname ?? null)}
            />
          )
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}
