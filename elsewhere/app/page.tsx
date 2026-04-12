"use client";

import { AuthEntryRedirect } from "@/components/auth/AuthEntryRedirect";

/** First visit → signup; returning → feed (see AuthEntryRedirect). */
export default function Home() {
  return <AuthEntryRedirect />;
}
