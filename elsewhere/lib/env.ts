import "server-only";

/**
 * Server-side environment validation. Invoked from instrumentation (Node runtime).
 */

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "GOOGLE_PLACES_API_KEY",
] as const;

/**
 * Needed only by the place-submission webhook (Supabase DB webhook -> Resend).
 * Enforced in production because every one of them fails silently there: a
 * missing SUPABASE_WEBHOOK_SECRET 401s every delivery, and a missing
 * DEVELOPER_NOTIFICATION_EMAIL or RESEND_API_KEY still returns 200 to Supabase
 * while the email is never sent. Locally these only warn so `npm run dev` works
 * without Resend credentials.
 */
const REQUIRED_IN_PRODUCTION = [
  "SUPABASE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "DEVELOPER_NOTIFICATION_EMAIL",
] as const;

function missing(name: string): boolean {
  const v = process.env[name];
  return v == null || String(v).trim() === "";
}

export function assertServerEnv(): void {
  const absent = REQUIRED.filter(missing);
  if (absent.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${absent.join(", ")}. ` +
        "Set them in .env.local (local) or the Vercel project (production).",
    );
  }

  const authSecret =
    process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!authSecret) {
    throw new Error(
      "Missing NEXTAUTH_SECRET or AUTH_SECRET. " +
        "Set either one to a long random value (e.g. openssl rand -base64 32). " +
        "This app uses Supabase for sign-in; the secret is still required for production checks and future server features.",
    );
  }

  const absentWebhookVars = REQUIRED_IN_PRODUCTION.filter(missing);
  if (absentWebhookVars.length === 0) return;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Missing required environment variable(s): ${absentWebhookVars.join(", ")}. ` +
        "These power the place-submission notification webhook; without them " +
        "submissions are accepted but no one is told about them. " +
        "Set them in the Vercel project.",
    );
  }

  console.warn(
    `[env] Not set: ${absentWebhookVars.join(", ")}. ` +
      "POST /api/webhooks/new-submission will 401 or skip its email until these " +
      "are in .env.local. Required in production.",
  );
}
