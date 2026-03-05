export function PlaceCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-radius-md border border-surface-alt bg-surface">
      {/* Hero area */}
      <div className="aspect-[4/3] w-full bg-surface-alt animate-pulse" />
      {/* Stats row */}
      <div className="flex gap-8 p-12">
        <div className="h-16 min-w-0 flex-1 rounded-radius-sm bg-surface-alt animate-pulse" />
        <div className="h-16 min-w-0 flex-1 rounded-radius-sm bg-surface-alt animate-pulse" />
        <div className="h-16 min-w-0 flex-1 rounded-radius-sm bg-surface-alt animate-pulse" />
      </div>
      {/* Pills row */}
      <div className="flex gap-8 px-12 pb-8">
        <div className="h-8 w-24 rounded-radius-sm bg-surface-alt animate-pulse" />
        <div className="h-8 w-28 rounded-radius-sm bg-surface-alt animate-pulse" />
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between gap-8 border-t border-surface-alt px-12 py-12">
        <div className="flex items-center gap-8">
          <div className="h-8 w-8 rounded-full bg-surface-alt animate-pulse" />
          <div className="h-4 w-32 rounded bg-surface-alt animate-pulse" />
        </div>
        <div className="h-11 w-16 rounded-radius-sm bg-surface-alt animate-pulse" />
      </div>
    </div>
  );
}
