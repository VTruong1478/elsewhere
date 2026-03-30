"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { captureEvent } from "@/lib/analytics";
import { consumeOAuthAuthIntent } from "@/lib/gatedAction";

/**
 * After Google OAuth, Supabase redirects to /auth/callback then to `next` or /feed.
 * Fires login_completed / sign_up_completed once based on which page started OAuth.
 * Identifies before completion events so person is linked first.
 */
export function PostHogOAuthCompletion() {
  useEffect(() => {
    const intent = consumeOAuthAuthIntent();
    if (!intent) return;

    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        posthog.identify(session.user.id);
      }
      if (intent === "login") {
        captureEvent("login_completed", { method: "oauth_google" });
      } else if (intent === "signup") {
        captureEvent("sign_up_completed", { method: "oauth_google" });
      }
    })();
  }, []);

  return null;
}
