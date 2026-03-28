"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound } from "lucide-react";

export function TopNav() {
  const pathname = usePathname();
  const isProfile = pathname === "/profile";

  return (
    <header
      className="z-40 flex h-[72px] w-full shrink-0 items-center justify-between bg-background px-16"
      suppressHydrationWarning
    >
      <Link href="/feed" className="font-lora text-heading-l text-text">
        elsewhere
      </Link>
      <Link
        href="/profile"
        aria-label="Profile"
        className={`flex h-40 w-40 items-center justify-center rounded-full ${
          isProfile
            ? "bg-primary text-text-inverse"
            : "bg-surface-alt text-text"
        }`}
      >
        <CircleUserRound
          size={20}
          className={isProfile ? "text-text-inverse" : "text-primary"}
        />
      </Link>
    </header>
  );
}
