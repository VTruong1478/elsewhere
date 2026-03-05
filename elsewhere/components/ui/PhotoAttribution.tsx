"use client";

export type PhotoAttributionPayload = {
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
};

interface PhotoAttributionProps {
  /** From vibe_photo_attribution or google attribution (authorAttributions array) */
  attribution: PhotoAttributionPayload | null | undefined;
  className?: string;
}

/**
 * Renders a small line: "Photo: {authorName}" with optional link to authorUri.
 * Use in place detail view (and optionally on cards).
 */
export function PhotoAttribution({
  attribution,
  className = "",
}: PhotoAttributionProps) {
  const first = attribution?.authorAttributions?.[0];
  const name = first?.displayName?.trim();
  const uri = first?.uri?.trim();

  if (!name) return null;

  return (
    <p
      className={`text-ui-label-s text-text-tertiary ${className}`}
      aria-label={`Photo credit: ${name}`}
    >
      Photo:{" "}
      {uri ? (
        <a
          href={uri}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-text"
        >
          {name}
        </a>
      ) : (
        <span>{name}</span>
      )}
    </p>
  );
}
