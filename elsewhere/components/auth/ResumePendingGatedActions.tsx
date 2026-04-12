"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  peekPendingGatedAction,
  tryCaptureGatedActionCompleted,
} from "@/lib/gatedAction";

/**
 * After login/signup, completes a pending "save place" that was blocked while logged out.
 * Pending action is stored in sessionStorage by `ensureAuthForGatedAction`.
 */
export function ResumePendingGatedActions() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    async function resumeSaveIfNeeded() {
      if (inFlight.current) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const pending = peekPendingGatedAction();
      if (!pending || pending.action_type !== "save_place" || !pending.place_id) {
        return;
      }

      inFlight.current = true;
      try {
        const res = await fetch("/api/saved", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place_id: pending.place_id }),
        });

        if (!res.ok) return;

        tryCaptureGatedActionCompleted({
          action_type: "save_place",
          place_id: pending.place_id,
        });
        await queryClient.invalidateQueries({ queryKey: ["saved-places"] });
        await queryClient.invalidateQueries({ queryKey: ["feed"] });
      } finally {
        inFlight.current = false;
      }
    }

    void resumeSaveIfNeeded();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        void resumeSaveIfNeeded();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return null;
}
