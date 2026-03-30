import { createClient } from "@/lib/supabase/client";
import { captureEvent } from "@/lib/analytics";
import type { AnalyticsSource } from "@/lib/analytics";
import type { GatedActionType } from "@/lib/gatedAction";
import { persistPendingGatedAction } from "@/lib/gatedAction";

export type GateContext = {
  action_type: GatedActionType;
  source: AnalyticsSource;
  place_id?: string;
  place_name?: string;
  returnPath: string;
};

const gateProps = (ctx: GateContext) =>
  ({
    action_type: ctx.action_type,
    source: ctx.source,
    place_id: ctx.place_id,
    place_name: ctx.place_name,
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

  captureEvent("gated_action_attempted", gateProps(ctx));
  captureEvent("auth_gate_shown", gateProps(ctx));
  persistPendingGatedAction({
    action_type: ctx.action_type,
    returnPath: ctx.returnPath,
    place_id: ctx.place_id,
    place_name: ctx.place_name,
    source: ctx.source,
  });

  const next = encodeURIComponent(ctx.returnPath);
  navigate(`/login?next=${next}`);
  return false;
}
