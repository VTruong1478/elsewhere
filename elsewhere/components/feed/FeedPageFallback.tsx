import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";

/**
 * Two-column feed shell shown before the feed can render anything.
 *
 * Used both as the page's own Suspense fallback (useSearchParams suspends) and
 * as the route-level loading.tsx, so a navigation into /feed and a client-side
 * suspend show the same thing.
 */
export function FeedPageFallback() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col lg:grid lg:grid-cols-12 lg:overflow-hidden">
      <div className="flex min-h-0 w-full flex-col overflow-hidden lg:col-span-4 lg:min-h-0 lg:overflow-y-auto">
        <div className="shrink-0 space-y-4 p-4">
          <div className="h-12 rounded-radius-sm bg-surface-alt animate-pulse" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 w-20 rounded-radius-sm bg-surface-alt animate-pulse"
              />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 lg:px-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <div className="hidden min-h-0 lg:col-span-8 lg:block lg:h-full bg-surface-alt animate-pulse" />
    </div>
  );
}
