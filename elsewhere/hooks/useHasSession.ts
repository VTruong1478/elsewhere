import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Whether a Supabase session exists, for gating client fetches that are
 * meaningless without one.
 *
 * `null` means "not known yet" — callers should treat it as neither in nor out
 * and simply not fetch, rather than assuming logged out and rendering an empty
 * state that immediately changes.
 *
 * The subscribe-and-track shape is the same one `TopNav`, `Header` and
 * `providers` already use; this exists so query-gating callers do not have to
 * repeat it a fifth time.
 */
export function useHasSession(): boolean | null {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setHasSession(Boolean(session?.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setHasSession(Boolean(session?.user));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return hasSession;
}
