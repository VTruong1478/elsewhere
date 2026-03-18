"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FEED_FILTER_OPTIONS, type FeedFilter } from "@/types/feed";
import { Pill } from "@/components/ui/Pill";

export function FilterChips() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const current = (searchParams.get("filter") ?? "") as FeedFilter;

  const basePath = pathname?.startsWith("/map") ? "/map" : "/feed";

  function selectFilter(value: FeedFilter) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) {
      next.set("filter", value);
    } else {
      next.delete("filter");
    }
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div className="scrollbar-hide flex flex-nowrap gap-2 overflow-x-auto overflow-y-hidden px-16 py-8">
      {FEED_FILTER_OPTIONS.map(({ value, label }) => {
        const isSelected = current === value;
        return (
          <button
            key={value || "all"}
            type="button"
            onClick={() => selectFilter(value)}
            className="relative z-10 rounded-radius-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0"
          >
            <Pill
              variant="placeType"
              className={isSelected ? "!bg-accent !text-surface" : ""}
            >
              {label}
            </Pill>
          </button>
        );
      })}
    </div>
  );
}
