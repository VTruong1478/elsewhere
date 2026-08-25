export default function Loading() {
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col"
      aria-busy
      aria-label="Loading place"
    >
      {/* Mirrors both breakpoints of the page: a map surface with a detail
          panel over it (desktop) / a sheet below it (mobile). */}
      <div className="min-h-0 flex-1 animate-pulse bg-surface-alt" />
      <div className="shrink-0 space-y-8 rounded-t-radius-md bg-surface px-16 pb-24 pt-16 lg:hidden">
        <div className="h-48 w-full animate-pulse rounded-radius-md bg-surface-alt" />
        <div className="h-8 w-2/3 animate-pulse rounded-radius-sm bg-surface-alt" />
        <div className="h-6 w-1/3 animate-pulse rounded-radius-sm bg-surface-alt" />
      </div>
    </div>
  );
}
