"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Shared by `/` and `/auth`: first-time visitors → signup; returning → feed;
 * just logged out → login.
 */
export function AuthEntryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const justLoggedOut = localStorage.getItem("justLoggedOut") === "true";
    if (justLoggedOut) {
      localStorage.removeItem("justLoggedOut");
      router.replace("/login");
      return;
    }

    const hasVisited = localStorage.getItem("hasVisited") === "true";
    router.replace(hasVisited ? "/feed" : "/signup");
  }, [router]);

  return null;
}
