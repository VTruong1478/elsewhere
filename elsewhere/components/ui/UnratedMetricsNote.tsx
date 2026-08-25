/**
 * Stands in for the four metric tiles on a place with no ratings.
 *
 * Four tiles all reading "NOT ENOUGH DATA" filled the card with identical
 * negatives (and wrapped to two lines each at 390px), which made an unrated
 * venue look worse than a badly-rated one. One quiet line says the same thing
 * without shouting, and stays subordinate to the photo, name and CTA.
 *
 * Tokens only: surface-chip background, radius-sm, body-s / text-secondary.
 */
export function UnratedMetricsNote({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-radius-sm bg-surface-chip px-12 py-8 text-body-s text-text-secondary ${className}`.trim()}
    >
      Noise, vibes, tables and outlets show up here once someone rates this
      place.
    </p>
  );
}
