export default function Loading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-16 bg-background px-16"
      aria-busy
      aria-label="Loading"
    >
      <div className="h-40 w-full max-w-xs animate-pulse rounded-radius-md bg-surface-alt" />
      <div className="h-16 w-48 animate-pulse rounded-radius-md bg-surface-alt" />
    </div>
  );
}
