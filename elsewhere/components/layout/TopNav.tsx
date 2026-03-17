import Link from "next/link";
import { CircleUserRound } from "lucide-react";

export function TopNav() {
  return (
    <header className="flex h-[72px] w-full shrink-0 items-center justify-between bg-bg px-16 md:h-[88px] z-40">
      <Link href="/feed" className="font-lora text-heading-l text-text">
        elsewhere
      </Link>
      <Link
        href="/profile"
        aria-label="Profile"
        className="flex h-40 w-40 items-center justify-center rounded-full bg-surface-alt text-text"
      >
        <CircleUserRound size={20} className="text-primary" />
      </Link>
    </header>
  );
}
