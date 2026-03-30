import { captureEvent } from "@/lib/analytics";
import type { AnalyticsSource } from "@/lib/analytics";

export type GatedActionType =
  | "save_place"
  | "rate_place"
  | "upload_photo"
  | "other";

const PENDING_KEY = "elsewhere:pendingGatedAction";
const OAUTH_INTENT_KEY = "elsewhere:oauthAuthIntent";
const OAUTH_INTENT_MAX_AGE_MS = 15 * 60 * 1000;

export type PendingGatedAction = {
  action_type: GatedActionType;
  returnPath: string;
  place_id?: string;
  place_name?: string;
  source?: AnalyticsSource;
};

export function persistPendingGatedAction(p: PendingGatedAction): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // ignore quota / private mode
  }
}

export function peekPendingGatedAction(): PendingGatedAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingGatedAction;
  } catch {
    return null;
  }
}

export function clearPendingGatedAction(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/** Derive action_type from a return path (e.g. middleware ?next=). */
export function gatedActionTypeFromPath(path: string): GatedActionType {
  if (path.includes("/rate")) return "rate_place";
  return "other";
}

export function tryCaptureGatedActionCompleted(opts: {
  action_type: GatedActionType;
  place_id: string;
}): void {
  const pending = peekPendingGatedAction();
  if (!pending) return;
  if (pending.action_type !== opts.action_type) return;
  if (pending.place_id && pending.place_id !== opts.place_id) return;
  captureEvent("gated_action_completed", {
    action_type: pending.action_type,
    source: pending.source,
    place_id: pending.place_id,
    place_name: pending.place_name,
  });
  clearPendingGatedAction();
}

export type OAuthAuthIntent = "login" | "signup";

export function setOAuthAuthIntent(intent: OAuthAuthIntent): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      OAUTH_INTENT_KEY,
      JSON.stringify({ intent, ts: Date.now() }),
    );
  } catch {
    // ignore
  }
}

export function consumeOAuthAuthIntent(): OAuthAuthIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OAUTH_INTENT_KEY);
    sessionStorage.removeItem(OAUTH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { intent?: unknown; ts?: unknown };
    const intent =
      parsed.intent === "login" || parsed.intent === "signup"
        ? parsed.intent
        : null;
    const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
    if (!intent || Date.now() - ts > OAUTH_INTENT_MAX_AGE_MS) return null;
    return intent;
  } catch {
    return null;
  }
}
