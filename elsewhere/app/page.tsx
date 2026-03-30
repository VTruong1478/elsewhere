import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Logged-out users land on sign up; returning users with a session go to the feed. */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/feed");
  }
  redirect("/signup");
}
