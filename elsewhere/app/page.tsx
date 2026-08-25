"use client";

import { AuthEntryRedirect } from "@/components/auth/AuthEntryRedirect";

/** Everyone → feed; just-logged-out → login (see AuthEntryRedirect). */
export default function Home() {
  return <AuthEntryRedirect />;
}
