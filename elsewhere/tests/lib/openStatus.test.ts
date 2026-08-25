import { describe, it, expect, vi, afterEach } from "vitest";
import { openStatusFrom, closedLabel } from "@/lib/openStatus";
import { deriveOpeningState } from "@/lib/openingHours";

const CLOSED = {
  open_now: false,
  closes_at: null,
  closing_soon: false,
  open_late: false,
  opens_at: null,
};

describe("closedLabel", () => {
  it("stays a bare Closed when the next opening is unknown", () => {
    expect(closedLabel(null)).toBe("Closed");
  });

  it("names the next opening when it is known", () => {
    expect(closedLabel("10am")).toBe("Closed · opens 10am");
    expect(closedLabel("tomorrow 10am")).toBe("Closed · opens tomorrow 10am");
  });
});

describe("openStatusFrom", () => {
  it("prefers closing-soon over the plain open label", () => {
    expect(
      openStatusFrom({ ...CLOSED, open_now: true, closes_at: "9:00pm", closing_soon: true }),
    ).toEqual({ status: "closing-soon", label: "Closing soon (9:00pm)" });
  });

  it("reports the closing time when open", () => {
    expect(openStatusFrom({ ...CLOSED, open_now: true, closes_at: "9:00pm" })).toEqual({
      status: "open",
      label: "Open until 9:00pm",
    });
  });

  it("carries the next opening into the closed label", () => {
    expect(openStatusFrom({ ...CLOSED, opens_at: "Mon 10am" })).toEqual({
      status: "closed",
      label: "Closed · opens Mon 10am",
    });
  });

  it("falls back to a bare Closed with no next opening", () => {
    expect(openStatusFrom(CLOSED)).toEqual({ status: "closed", label: "Closed" });
  });

  it("labels an open-late place with no closing time", () => {
    expect(openStatusFrom({ ...CLOSED, open_now: true, open_late: true })).toEqual({
      status: "open",
      label: "Open",
    });
  });

  it("returns null when open with nothing worth saying", () => {
    expect(openStatusFrom({ ...CLOSED, open_now: true })).toBeNull();
  });
});

describe("deriveOpeningState opens_at", () => {
  // Mon-Fri 10:00-21:00. `date` is frozen in April on purpose: the seeded rows
  // carry the week Google returned at import time, so anything that trusted
  // those calendar dates would never match a present-day "now".
  const OH = {
    periods: [1, 2, 3, 4, 5].map((d) => ({
      open: { day: d, date: { year: 2026, month: 4, day: 19 + d }, hour: 10, minute: 0 },
      close: { day: d, date: { year: 2026, month: 4, day: 19 + d }, hour: 21, minute: 0 },
    })),
  };

  function at(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    return deriveOpeningState(OH, "America/New_York");
  }

  afterEach(() => vi.useRealTimers());

  it("names a later-today opening", () => {
    // Tue 02:46 EDT — before the 10am open.
    expect(at("2026-08-25T06:46:00Z").opens_at).toBe("10am");
  });

  it("rolls to tomorrow once today's window has passed", () => {
    // Tue 22:00 EDT — after the 9pm close.
    expect(at("2026-08-26T02:00:00Z").opens_at).toBe("tomorrow 10am");
  });

  it("skips the closed weekend to the next open weekday", () => {
    // Fri 22:00 EDT and Sat 14:00 EDT both resolve to Monday.
    expect(at("2026-08-29T02:00:00Z").opens_at).toBe("Mon 10am");
    expect(at("2026-08-29T18:00:00Z").opens_at).toBe("Mon 10am");
  });

  it("says tomorrow rather than the weekday name on Sunday", () => {
    expect(at("2026-08-30T18:00:00Z").opens_at).toBe("tomorrow 10am");
  });

  it("is null while the place is open", () => {
    const state = at("2026-08-25T18:00:00Z");
    expect(state.open_now).toBe(true);
    expect(state.opens_at).toBeNull();
  });

  it("is null when the place has no hours at all", () => {
    expect(deriveOpeningState(null, "America/New_York").opens_at).toBeNull();
  });

  it("keeps the :30 when an opening is not on the hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T06:00:00Z")); // Tue 02:00 EDT
    const half = {
      periods: [
        { open: { day: 2, hour: 6, minute: 30 }, close: { day: 2, hour: 14, minute: 0 } },
      ],
    };
    expect(deriveOpeningState(half, "America/New_York").opens_at).toBe("6:30am");
  });
});
