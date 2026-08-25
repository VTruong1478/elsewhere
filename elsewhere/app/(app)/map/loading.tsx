export default function Loading() {
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col"
      aria-busy
      aria-label="Loading map"
    >
      <div className="shrink-0 px-16 py-8">
        <div className="h-12 animate-pulse rounded-radius-sm bg-surface-alt" />
      </div>
      <div className="min-h-0 flex-1 animate-pulse bg-surface-alt" />
    </div>
  );
}
