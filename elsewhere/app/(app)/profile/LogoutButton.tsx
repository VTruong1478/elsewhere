"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="mt-24 text-body-m text-text-secondary underline-offset-2 hover:underline"
    >
      Log out &rarr;
    </button>
  );
}

