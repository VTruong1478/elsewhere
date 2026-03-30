"use client";

import { useEffect, type ReactNode } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { createClient } from "@/lib/supabase/client";
import { PostHogOAuthCompletion } from "@/components/PostHogOAuthCompletion";
import { DEFAULT_POSTHOG_API_HOST } from "@/lib/posthogDefaults";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      console.warn("[PostHog] NEXT_PUBLIC_POSTHOG_KEY is missing — analytics disabled.");
      return;
    }

    const apiHost =
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_API_HOST;

    if (typeof window !== "undefined") {
      console.log("[PostHog] env (client)", {
        keyPresent: true,
        host: apiHost,
        hostFromEnv: Boolean(process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim()),
      });
    }

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: apiHost,
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      capture_pageleave: true,
      autocapture: true,
      loaded: (ph) => {
        console.log("[PostHog] loaded", {
          keyPresent: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
          host: apiHost,
        });
        ph.capture("test_event", { source: "posthog_debug" });
        // TEMPORARY: remove after confirming events in PostHog dashboard
        ph.capture("manual_test_event", { source: "debug" });
      },
    });
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        posthog.identify(session.user.id);
      }
      if (event === "SIGNED_OUT") {
        posthog.reset();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <PostHogOAuthCompletion />
      {children}
    </PostHogProvider>
  );
}
