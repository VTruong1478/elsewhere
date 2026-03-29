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
}
