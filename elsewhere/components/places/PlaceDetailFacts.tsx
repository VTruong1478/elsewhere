"use client";

import { useState } from "react";
import {
  ChevronDown,
  MapPin,
  Star,
  Toilet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { weekdayHours, type OpeningHours } from "@/lib/openingHours";
import { distanceMilesBetween } from "@/lib/locationRegion";
import type { UserLocationState } from "@/lib/feedLocationContext";
import {
  BATHROOM_DETAIL_LABEL,
  WIFI_DETAIL_LABEL,
  type BathroomAccess,
  type WifiLevel,
} from "@/lib/placeFeatures";

type PlaceDetailFactsProps = {
  address: string | null | undefined;
  lat: number;
  lng: number;
  openingHours: OpeningHours | null;
  timezone: string | null;
  ratingCount: number;
  /** Community average out of 5, or null when nobody has rated yet. */
  avgOverall: number | null;
  /** Optional rating attributes; null when nobody has answered. Rows are omitted. */
  wifi: WifiLevel | null;
  bathroom: BathroomAccess | null;
  /**
   * Only used when `status === "ready"`. Any other state means we do not know
   * where the user is, and a distance measured from the Annandale fallback
   * would be fabricated (see P0-2) — so no distance is shown at all.
   */
  locationState: UserLocationState;
};

/**
 * The facts someone needs to decide whether to actually go and work somewhere:
 * how well it is rated, how far it is, where it is, and when it is open.
 *
 * All of this already existed in the API and was simply never rendered — the
 * detail page showed a name, an open/closed dot and four metric tiles, so you
 * could not tell where a place was or what people thought of it.
 *
 * Every row is omitted when its data is missing. Nothing here is derived,
 * estimated, or filled in with a placeholder.
 */
export function PlaceDetailFacts({
  address,
  lat,
  lng,
  openingHours,
  timezone,
  ratingCount,
  avgOverall,
  wifi,
  bathroom,
  locationState,
}: PlaceDetailFactsProps) {
  const [hoursOpen, setHoursOpen] = useState(false);

  const hours = weekdayHours(openingHours, timezone);
  const trimmedAddress = address?.trim() || null;

  const distanceMi =
    locationState.status === "ready" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
      ? distanceMilesBetween(
          { lat: locationState.lat, lng: locationState.lng },
          { lat, lng },
        )
      : null;

  const hasRating = ratingCount > 0 && avgOverall != null;

  return (
    <div className="flex flex-col gap-8">
      {(hasRating || distanceMi != null) && (
        <div className="flex flex-wrap items-center gap-8">
          {hasRating && (
            <span className="inline-flex items-center gap-4">
              <Star
                size={16}
                className="shrink-0 fill-primary text-primary"
                aria-hidden
              />
              <span className="text-ui-label-l text-text">
                {avgOverall.toFixed(1)}
              </span>
              <span className="text-body-s text-text-secondary">
                ({ratingCount} {ratingCount === 1 ? "rating" : "ratings"})
              </span>
            </span>
          )}
          {hasRating && distanceMi != null && (
            <span className="text-body-s text-text-tertiary" aria-hidden>
              ·
            </span>
          )}
          {distanceMi != null && (
            <span className="text-body-s text-text-secondary">
              {distanceMi.toFixed(1)} mi away
            </span>
          )}
        </div>
      )}

      {trimmedAddress && (
        <p className="flex items-start gap-8 text-body-s text-text-secondary">
          <MapPin size={16} className="mt-2 shrink-0" aria-hidden />
          <span className="min-w-0">{trimmedAddress}</span>
        </p>
      )}

      {wifi && (
        <p className="flex items-center gap-8 text-body-s text-text-secondary">
          {wifi === "none" ? (
            <WifiOff size={16} className="shrink-0 text-text" aria-hidden />
          ) : (
            <Wifi size={16} className="shrink-0 text-text" aria-hidden />
          )}
          <span className="min-w-0">{WIFI_DETAIL_LABEL[wifi]}</span>
        </p>
      )}

      {bathroom && (
        <p className="flex items-center gap-8 text-body-s text-text-secondary">
          <Toilet size={16} className="shrink-0 text-text" aria-hidden />
          <span className="min-w-0">{BATHROOM_DETAIL_LABEL[bathroom]}</span>
        </p>
      )}

      {hours && (
        <div>
          <button
            type="button"
            onClick={() => setHoursOpen((v) => !v)}
            aria-expanded={hoursOpen}
            className="flex w-full items-center gap-8 rounded-radius-sm text-left text-body-s text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="min-w-0 flex-1 truncate">
              {hours.lines[hours.todayIndex]}
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 ${hoursOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
            <span className="sr-only">
              {hoursOpen ? "Hide all opening hours" : "Show all opening hours"}
            </span>
          </button>
          {hoursOpen && (
            <ul className="mt-8 flex flex-col gap-4">
              {hours.lines.map((line, i) => (
                <li
                  key={line}
                  className={`text-body-s ${
                    i === hours.todayIndex
                      ? "text-text"
                      : "text-text-secondary"
                  }`}
                >
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
