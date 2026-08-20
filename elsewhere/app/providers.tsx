"use client";

import { useEffect, type ReactNode } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { createClient } from "@/lib/supabase/client";
import { ToastProvider } from "@/components/ui/Toast";
import { PostHogOAuthCompletion } from "@/components/PostHogOAuthCompletion";
import { DEFAULT_POSTHOG_API_HOST } from "@/lib/posthogDefaults";

function setDevAuthCookie(enabled: boolean) {
  if (process.env.NODE_ENV !== "development" || typeof document === "undefined")
    return;
  if (enabled) {
    document.cookie = "dev_auth=1; path=/; max-age=86400; samesite=lax";
  } else {
    document.cookie = "dev_auth=; path=/; max-age=0; samesite=lax";
  }
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[PostHog] NEXT_PUBLIC_POSTHOG_KEY is missing — analytics disabled.",
        );
      }
      return;
    }

    const apiHost =
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_API_HOST;

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: apiHost,
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      capture_pageleave: true,
      autocapture: true,
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    // Prefer getSession first: reads persisted session without a round trip.
    // getUser() can resolve null briefly and cleared dev_auth before hydration.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user;
      setDevAuthCookie(Boolean(u));
      if (process.env.NEXT_PUBLIC_POSTHOG_KEY && u) {
        posthog.identify(u.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setDevAuthCookie(Boolean(session?.user));
      if (process.env.NEXT_PUBLIC_POSTHOG_KEY && session?.user) {
        posthog.identify(session.user.id);
      }
      if (event === "SIGNED_OUT") {
        setDevAuthCookie(false);
        if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
          posthog.reset();
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <PostHogOAuthCompletion />
      <ToastProvider>{children}</ToastProvider>
    </PostHogProvider>
  );
}
