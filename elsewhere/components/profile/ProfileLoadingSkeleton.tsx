/**
 * Placeholder for the profile header both profile routes render.
 *
 * Both pages are async RSCs that await a 6–7 way Promise.all of Supabase counts
 * before emitting any HTML, so without this the tab shows nothing for the whole
 * round trip. Mirrors ProfileContent's avatar → name → stat row → tab strip.
 */
export function ProfileLoadingSkeleton() {
  return (
    <main
      className="min-h-screen w-full bg-background px-16 pt-40 pb-24"
      aria-busy
      aria-label="Loading profile"
    >
      <div className="mx-auto max-w-md">
        <div className="mb-16 flex justify-center">
          <div className="h-80 w-80 animate-pulse rounded-full bg-surface-alt" />
        </div>
        <div className="mb-4 flex justify-center">
          <div className="h-10 w-48 animate-pulse rounded-radius-sm bg-surface-alt" />
        </div>
        <div className="mb-16 flex justify-center">
          <div className="h-6 w-32 animate-pulse rounded-radius-sm bg-surface-alt" />
        </div>
        <div className="mb-16 flex justify-center gap-24">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-4">
              <div className="h-8 w-10 animate-pulse rounded-radius-sm bg-surface-alt" />
              <div className="h-5 w-16 animate-pulse rounded-radius-sm bg-surface-alt" />
            </div>
          ))}
        </div>
        <div className="mb-16 flex gap-12">
          <div className="h-10 flex-1 animate-pulse rounded-radius-sm bg-surface-alt" />
          <div className="h-10 flex-1 animate-pulse rounded-radius-sm bg-surface-alt" />
        </div>
        <div className="space-y-12">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-radius-md bg-surface-alt"
              aria-hidden
            />
          ))}
        </div>
      </div>
    </main>
  );
}
