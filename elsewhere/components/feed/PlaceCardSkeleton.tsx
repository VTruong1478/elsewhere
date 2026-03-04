export function PlaceCardSkeleton() {
  return (
    <div className="rounded-radius-sm border border-surface-alt bg-surface p-4">
      <div className="mb-3 h-4 w-3/4 rounded bg-surface-alt animate-pulse" />
      <div className="mb-4 h-3 w-full rounded bg-surface-alt animate-pulse" />
      <div className="mb-4 flex gap-2">
        <div className="h-8 w-20 rounded bg-surface-alt animate-pulse" />
        <div className="h-8 w-20 rounded bg-surface-alt animate-pulse" />
        <div className="h-8 w-20 rounded bg-surface-alt animate-pulse" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-24 rounded bg-surface-alt animate-pulse" />
        <div className="h-6 w-20 rounded bg-surface-alt animate-pulse" />
      </div>
    </div>
  );
}
