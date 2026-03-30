"use client";

import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    localStorage.setItem("justLoggedOut", "true");
    const supabase = createClient();
    await supabase.auth.signOut();
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.reset();
    }
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="mt-24 text-body-m text-accent text-link"
    >
      Log out &rarr;
    </button>
  );
}
