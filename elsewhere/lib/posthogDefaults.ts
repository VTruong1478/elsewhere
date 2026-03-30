/**
 * Default when `NEXT_PUBLIC_POSTHOG_HOST` is unset (common cause of zero events).
 * EU projects: set `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` in `.env.local`.
 */
export const DEFAULT_POSTHOG_API_HOST = "https://us.i.posthog.com";
