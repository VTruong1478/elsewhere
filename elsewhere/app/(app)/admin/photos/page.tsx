import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/adminAuth";
import { AdminPhotosClient } from "./AdminPhotosClient";

/**
 * Server-side admin gate. Middleware only requires *a* session for /admin, so
 * without this any signed-in user could load the page and enumerate `places`
 * through the browser Supabase client. notFound() rather than a 403 so the
 * route's existence isn't advertised.
 */
export default async function AdminPhotosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminUser(user)) notFound();

  return <AdminPhotosClient />;
}
