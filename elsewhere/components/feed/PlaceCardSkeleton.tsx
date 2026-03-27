/**
 * Mirrors {@link PlaceCard} section-for-section: hero (192px) + overlay controls,
 * 4-column metric grid, optional-style pills row, footer (status + rate CTA).
 */
export function PlaceCardSkeleton() {
  return (
    <article
      className="relative overflow-hidden rounded-radius-md border border-surface-alt bg-surface"
      aria-hidden
    >
      {/* Hero image area — h-[192px] matches PlaceCard */}
      <div className="relative h-[192px] w-full overflow-hidden rounded-t-radius-md bg-surface-alt">
        <div className="overlay-gradient rounded-t-radius-md" aria-hidden />

        <div className="absolute inset-0 z-0 flex flex-col">
          {/* Place type pill — left-16 top-16 */}
          <div className="absolute left-16 top-16 flex gap-8">
            <div className="inline-flex items-center justify-center rounded-radius-sm bg-surface/90 px-12 py-4">
              <span className="h-8 w-24 animate-pulse rounded-radius-sm bg-surface-alt" />
            </div>
          </div>

          {/* Match ring — right-16 top-16, 48×48 */}
          <div className="absolute right-16 top-16">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface/90" />
          </div>

          {/* Title + address — bottom-12 left-12 right-12 pr-[48px] */}
          <div className="absolute bottom-12 left-12 right-12 flex flex-col gap-8 pr-[48px]">
            <div className="h-7 max-w-[220px] animate-pulse rounded-radius-sm bg-surface/90" />
            <div className="h-5 max-w-[180px] animate-pulse rounded-radius-sm bg-surface/90" />
          </div>

          {/* Save — bottom-12 right-12, secondaryIcon 40×40 */}
          <div className="absolute bottom-12 right-12 z-10 h-10 w-10 animate-pulse rounded-radius-md bg-surface/90 shadow-map" />
        </div>
      </div>

      {/* Stats row — grid-cols-4 gap-2 p-16, MetricTile shell */}
      <div className="grid w-full grid-cols-4 gap-2 p-16">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex min-w-0 w-full flex-col items-center justify-center rounded-radius-sm bg-surface-alt px-4 py-8 text-center"
          >
            <span className="mb-8 h-8 w-12 animate-pulse rounded-radius-sm bg-surface" />
            <div className="flex min-h-[20px] items-center justify-center">
              <span className="h-5 w-5 animate-pulse rounded-radius-sm bg-surface" />
            </div>
            <span className="mt-8 h-8 w-14 animate-pulse rounded-radius-sm bg-surface" />
          </div>
        ))}
      </div>

      {/* Amenity tags row — overflow-x-auto px-12 pb-8 (matches card when pills exist) */}
      <div className="overflow-x-auto px-12 pb-8">
        <div className="flex gap-8">
          <span className="inline-flex h-24 w-20 shrink-0 items-center rounded-radius-sm bg-surface-alt px-8 py-4 animate-pulse" />
          <span className="inline-flex h-24 w-28 shrink-0 items-center rounded-radius-sm bg-surface-alt px-8 py-4 animate-pulse" />
        </div>
      </div>

      {/* Footer row — px-16 py-16, justify-between (no top border on PlaceCard) */}
      <div className="flex flex-wrap items-center justify-between gap-8 px-16 py-16">
        <div className="flex min-w-0 items-center gap-8">
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-alt" />
          <div className="flex flex-col gap-8">
            <span className="h-8 w-32 animate-pulse rounded-radius-sm bg-surface-alt" />
            <span className="h-8 w-24 animate-pulse rounded-radius-sm bg-surface-alt" />
          </div>
        </div>
        <div className="inline-flex h-40 min-w-[72px] items-center justify-center rounded-radius-md bg-surface-alt px-24 py-8 animate-pulse" />
      </div>
    </article>
  );
}
