"use client";

import {
  AREA_WAITLIST_URL,
  LOCATION_STATUS_CASE1_AFTER,
  LOCATION_STATUS_CASE1_BEFORE,
  LOCATION_STATUS_CASE1_LINK,
  LOCATION_STATUS_CASE3_BEFORE,
  LOCATION_STATUS_CASE3_LINK,
  type FeedLocationStatusMessage,
} from "@/lib/feedLocationContext";

function requestBrowserLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    () => window.location.reload(),
    () => {},
  );
}

export function LocationStatusMessageBody({
  message,
}: {
  message: FeedLocationStatusMessage;
}) {
  if (message.kind === "plain") {
    return message.text;
  }
  if (message.kind === "request-location") {
    return (
      <>
        {LOCATION_STATUS_CASE1_BEFORE}
        <button
          type="button"
          onClick={requestBrowserLocation}
          className="text-link text-accent"
        >
          {LOCATION_STATUS_CASE1_LINK}
        </button>
        {LOCATION_STATUS_CASE1_AFTER}
      </>
    );
  }
  return (
    <>
      {LOCATION_STATUS_CASE3_BEFORE}
      <a
        href={AREA_WAITLIST_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-link text-accent"
      >
        {LOCATION_STATUS_CASE3_LINK}
      </a>
    </>
  );
}
