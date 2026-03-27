import {
  AREA_WAITLIST_URL,
  LOCATION_STATUS_CASE3_BEFORE,
  LOCATION_STATUS_CASE3_LINK,
  type FeedLocationStatusMessage,
} from "@/lib/feedLocationContext";

export function LocationStatusMessageBody({
  message,
}: {
  message: FeedLocationStatusMessage;
}) {
  if (message.kind === "plain") {
    return message.text;
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
