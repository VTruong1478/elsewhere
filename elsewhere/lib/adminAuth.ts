import "server-only";
import type { User } from "@supabase/supabase-js";

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ELSEWHERE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUser(user: User | null): boolean {
  if (!user) return false;

  const role = user.app_metadata?.role;
  if (role === "admin") return true;

  const roles = user.app_metadata?.roles;
  if (Array.isArray(roles) && roles.includes("admin")) return true;

  const email = user.email?.trim().toLowerCase();
  return Boolean(email && configuredAdminEmails().has(email));
}
