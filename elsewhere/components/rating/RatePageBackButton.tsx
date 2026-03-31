"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Same control as place detail mobile (no shadow on rate page). Uses browser history. */
export function RatePageBackButton({
  forceFeedOnBack = false,
}: {
  forceFeedOnBack?: boolean;
}) {
  const router = useRouter();
  return (
    <Button
      variant="secondaryIcon"
      type="button"
      onClick={() => {
        if (forceFeedOnBack) {
          router.push("/feed");
          return;
        }
        router.back();
      }}
      aria-label="Back"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden />
    </Button>
  );
}
