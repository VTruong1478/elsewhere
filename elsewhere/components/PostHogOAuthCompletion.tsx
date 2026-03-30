"use client";

import { useEffect } from "react";
import { captureEvent } from "@/lib/analytics";
import { consumeOAuthAuthIntent } from "@/lib/gatedAction";

/**
 * After Google OAuth, Supabase redirects to /auth/callback then to `next` or /feed.
 * Fires login_completed / sign_up_completed once based on which page started OAuth.
 */
export function PostHogOAuthCompletion() {
  useEffect(() => {
    const intent = consumeOAuthAuthIntent();
    if (intent === "login") {
      captureEvent("login_completed", { method: "oauth_google" });
    } else if (intent === "signup") {
      captureEvent("sign_up_completed", { method: "oauth_google" });
    }
  }, []);

  return null;
}
