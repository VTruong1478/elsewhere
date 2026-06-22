"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { captureEvent } from "@/lib/analytics";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    console.error(error);

    if (process.env.NODE_ENV === "production") {
      captureEvent("error_boundary_shown", {
        error_message: error.message,
        ...(error.digest ? { error_digest: error.digest } : {}),
        pathname,
      });
    }
  }, [error, pathname]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-24 bg-background px-16 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-heading-l text-text">Something went wrong</h1>
        <p className="mt-8 text-body-m text-text-secondary">
          We couldn&apos;t load this page. You can try again or go back home.
        </p>
        <div className="mt-24 flex flex-col items-center gap-12 sm:flex-row sm:justify-center">
          <Button type="button" variant="primary" onClick={() => reset()}>
            Try again
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/feed")}
          >
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
