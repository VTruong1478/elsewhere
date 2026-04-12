"use client";

import { AuthEntryRedirect } from "@/components/auth/AuthEntryRedirect";

/** Profile and legacy entry: same rules as `/` (AuthEntryRedirect). */
export default function AuthEntryPage() {
  return <AuthEntryRedirect />;
}
