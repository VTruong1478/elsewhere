"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { captureEvent } from "@/lib/analytics";

/**
 * Body shared by every error.tsx under app/(app)/.
 *
 * Sized to fill the layout's flex <main> rather than the viewport: the root
 * app/error.tsx uses min-h-dvh, which double-scrolls once the app shell (header
 * + bottom tabs) is still mounted around it — and keeping that shell mounted is
 * the whole point of these per-segment boundaries.
 */
export function SegmentErrorState({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Segment-specific headline, e.g. "Couldn't load your profile". */
  title: string;
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
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-24 bg-background px-16 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-heading-m text-text">{title}</h1>
        <p className="mt-8 text-body-m text-text-secondary">
          Something went wrong on our end. You can try again, or head back to
          the feed.
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
