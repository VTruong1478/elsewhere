export default function Loading() {
  return (
    <div
      className="w-full bg-background px-16 pb-32 pt-16 lg:pb-32"
      aria-busy
      aria-label="Loading rating form"
    >
      <div className="mx-auto max-w-xl space-y-8">
        <div className="h-10 w-2/3 animate-pulse rounded-radius-sm bg-surface-alt" />
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
