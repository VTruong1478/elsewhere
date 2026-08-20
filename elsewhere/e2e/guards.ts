import { test } from "@playwright/test";
import { HAS_DEV_AUTH } from "./env";

/**
 * Call at the top of an authenticated spec. Skips the whole file with a clear
 * reason when dev-auth credentials are not configured, so the suite stays green
 * on machines without them instead of failing on a missing session.
 */
export function requireDevAuth(): void {
  test.skip(
    !HAS_DEV_AUTH,
    "Requires DEV_AUTH_EMAIL / DEV_AUTH_PASSWORD in .env.local",
  );
}
