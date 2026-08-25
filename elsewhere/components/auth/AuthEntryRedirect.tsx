"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Shared by `/` and `/auth`.
 *
 * Everyone lands on the feed — discovery is the product and it works fully
 * logged out, so gating it behind signup hid the value before anyone could see
 * it. Identity is still required for save / rate / photo upload, enforced where
 * it belongs: `middleware.ts` for protected routes and `ensureAuthForGatedAction`
 * for in-page actions, both of which preserve the destination in `?next=`.
 *
 * The one exception is an explicit sign-out, which returns to `/login`.
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

    router.replace("/feed");
  }, [router]);

  return null;
}
