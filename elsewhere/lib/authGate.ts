import { createClient } from "@/lib/supabase/client";
import { captureEvent } from "@/lib/analytics";
import type { AnalyticsSource } from "@/lib/analytics";
import type { GatedActionType } from "@/lib/gatedAction";
import { persistPendingGatedAction } from "@/lib/gatedAction";

export type GateContext = {
  action_type: GatedActionType;
  source: AnalyticsSource;
  place_id: string;
  place_name: string;
  place_type?: string;
  has_photos?: boolean;
  returnPath: string;
};

const gateProps = (ctx: GateContext): Record<string, unknown> =>
  ({
    action_type: ctx.action_type,
    source: ctx.source,
    place_id: ctx.place_id,
    place_name: ctx.place_name,
    ...(ctx.place_type != null && ctx.place_type !== ""
      ? { place_type: ctx.place_type }
      : {}),
    ...(ctx.has_photos !== undefined ? { has_photos: ctx.has_photos } : {}),
  }) as Record<string, unknown>;

/**
 * If no session, records analytics, persists pending gated action, redirects to login with ?next=.
 * @returns true if authenticated and caller should continue.
 */
export async function ensureAuthForGatedAction(
  navigate: (href: string) => void,
  ctx: GateContext,
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return true;

  if (process.env.NODE_ENV === "development") {
    try {
      const res = await fetch("/api/dev-auth/status", {
        method: "GET",
        credentials: "same-origin",
      });
      if (res.ok) {
        const json = (await res.json()) as { authenticated?: boolean };
        if (json.authenticated) return true;
      }
    } catch {
      // Fall through to normal login gate.
    }
  }

  captureEvent("gated_action_attempted", gateProps(ctx));
  captureEvent("auth_gate_shown", gateProps(ctx));
  persistPendingGatedAction({
    action_type: ctx.action_type,
    returnPath: ctx.returnPath,
    place_id: ctx.place_id,
    place_name: ctx.place_name,
    source: ctx.source,
    place_type: ctx.place_type,
    has_photos: ctx.has_photos,
  });

  const next = encodeURIComponent(ctx.returnPath);
  navigate(`/login?next=${next}`);
  return false;
}
