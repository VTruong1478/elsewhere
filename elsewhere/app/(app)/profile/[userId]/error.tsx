"use client";

import { SegmentErrorState } from "@/components/layout/SegmentErrorState";

export default function PublicProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentErrorState error={error} reset={reset} title="Couldn’t load this profile" />;
}
