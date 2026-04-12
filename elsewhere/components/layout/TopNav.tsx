"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { CircleUserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOAuthAvatarUrl } from "@/lib/authUserDisplay";

export function TopNav() {
  const [user, setUser] = useState<User | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);

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

  const displayAvatarUrl =
    user != null
      ? profileAvatarUrl ?? getOAuthAvatarUrl(user) ?? null
      : null;

  return (
    <header
      className="z-40 flex h-[72px] w-full shrink-0 items-center justify-between bg-background px-16"
      suppressHydrationWarning
    >
      <Link href="/feed" className="font-lora text-heading-l text-text">
        elsewhere
      </Link>
      <Link
        href="/profile"
        aria-label="Profile"
        className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt text-text"
      >
        {displayAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same sources as profile / header
          <img
            src={displayAvatarUrl}
            alt=""
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <CircleUserRound size={20} className="text-primary" />
        )}
      </Link>
    </header>
  );
}
