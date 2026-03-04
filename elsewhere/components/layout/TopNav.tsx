import Link from 'next/link';

export function TopNav() {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-surface-alt bg-surface px-6 z-40">
      <Link href="/feed" className="font-lora text-heading-m text-text">
        Elsewhere
      </Link>
    </header>
  );
}
