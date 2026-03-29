"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-24 bg-background px-16 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-heading-l text-text">Something went wrong</h1>
        <p className="mt-8 text-body-m text-text-secondary">
          We couldn&apos;t load this page. You can try again or go back home.
        </p>
        <div className="mt-24 flex flex-col items-center gap-12 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => reset()} className="text-ui-button">
            Try again
          </Button>
          <Link
            href="/feed"
            className="inline-flex min-h-[44px] max-h-[36px] cursor-pointer items-center justify-center rounded-radius-md border-2 border-primary bg-transparent px-24 py-8 text-ui-label-l text-primary"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
