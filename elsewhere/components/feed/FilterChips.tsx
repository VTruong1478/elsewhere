"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { FEED_FILTER_OPTIONS, type FeedFilter } from "@/types/feed";
import { Pill } from "@/components/ui/Pill";
import {
  captureFiltersApplied,
  type AnalyticsSource,
} from "@/lib/analytics";

export function FilterChips() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const current = (searchParams.get("filter") ?? "") as FeedFilter;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const maxScroll = scrollWidth - clientWidth;
      const next = scrollLeft + delta;
      const clamped = Math.max(0, Math.min(maxScroll, next));
      const unchanged =
        (delta > 0 && scrollLeft >= maxScroll - 1) ||
        (delta < 0 && scrollLeft <= 0);
      if (unchanged) return;
      e.preventDefault();
      el.scrollLeft = clamped;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const basePath = pathname?.startsWith("/map") ? "/map" : "/feed";
  const filterSource: AnalyticsSource = basePath === "/map" ? "map" : "feed";

  function selectFilter(value: FeedFilter) {
    captureFiltersApplied({
      source: filterSource,
      filter: value || "all",
    });
    const next = new URLSearchParams(searchParams.toString());
    if (value) {
      next.set("filter", value);
    } else {
      next.delete("filter");
    }
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div
      ref={scrollRef}
      className="scrollbar-hide flex min-h-0 w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-16 py-8 [-webkit-overflow-scrolling:touch]"
    >
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
