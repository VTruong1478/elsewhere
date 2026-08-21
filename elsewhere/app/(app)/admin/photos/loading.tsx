export default function Loading() {
  return (
    <div
      className="w-full bg-background px-16 py-16"
      aria-busy
      aria-label="Loading admin photos"
    >
      <div className="mx-auto max-w-3xl space-y-12">
        <div className="h-10 w-48 animate-pulse rounded-radius-sm bg-surface-alt" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-radius-md bg-surface-alt"
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
