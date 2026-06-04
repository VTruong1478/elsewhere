import type { User } from "@supabase/supabase-js";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const DEV_COOKIE = "dev_auth";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export function getDevAuthCredentials(): {
  email: string;
  password: string;
} | null {
  if (process.env.NODE_ENV !== "development") return null;
  const email = process.env.DEV_AUTH_EMAIL?.trim().toLowerCase();
  const password = process.env.DEV_AUTH_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export function hasDevBypassCookie(cookieStore: ReadonlyRequestCookies): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    cookieStore.get(DEV_COOKIE)?.value === "1"
  );
}

/**
 * Resolve the dedicated dev test user from Supabase Auth.
 * Creates the user in development if it does not exist.
 */
export async function getOrCreateDevAuthUser(
  serviceClient: ServiceRoleClient,
): Promise<User> {
  const credentials = getDevAuthCredentials();
  if (!credentials) {
    throw new Error(
      "DEV_AUTH_EMAIL and DEV_AUTH_PASSWORD are required for dev auth",
    );
  }

  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(`Failed to list users for dev auth: ${error.message}`);
    }
    const users = data.users ?? [];
    const found = users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === credentials.email,
    );
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  const { data: created, error: createError } =
    await serviceClient.auth.admin.createUser({
      email: credentials.email,
      password: credentials.password,
      email_confirm: true,
    });
  if (createError || !created.user) {
    throw new Error(
      `Failed to create dev auth user: ${createError?.message ?? "unknown error"}`,
    );
  }
  return created.user;
}

/**
 * Non-throwing variant for route handlers that should degrade to unauthenticated
 * when the dev bypass cannot be resolved (e.g. local Supabase not running).
 */
export async function tryGetOrCreateDevAuthUser(
  serviceClient: ServiceRoleClient,
  context: string,
): Promise<User | null> {
  try {
    return await getOrCreateDevAuthUser(serviceClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[devAuth] ${context}: bypass unavailable (${message})`);
    return null;
  }
}
