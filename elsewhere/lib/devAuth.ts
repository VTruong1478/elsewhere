import type { User } from "@supabase/supabase-js";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const DEV_EMAIL = "test@example.com";
const DEV_PASSWORD = "testpass123";
const DEV_COOKIE = "dev_auth";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

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
      (u) => (u.email ?? "").trim().toLowerCase() === DEV_EMAIL,
    );
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  const { data: created, error: createError } =
    await serviceClient.auth.admin.createUser({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
  if (createError || !created.user) {
    throw new Error(
      `Failed to create dev auth user: ${createError?.message ?? "unknown error"}`,
    );
  }
  return created.user;
}
