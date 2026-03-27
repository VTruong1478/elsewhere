"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthEntryPage() {
  const router = useRouter();

  useEffect(() => {
    const justLoggedOut = localStorage.getItem("justLoggedOut") === "true";
    if (justLoggedOut) {
      localStorage.removeItem("justLoggedOut");
      router.replace("/login");
      return;
    }

    const hasVisited = localStorage.getItem("hasVisited") === "true";
    router.replace(hasVisited ? "/login" : "/signup");
  }, [router]);

  return null;
}
