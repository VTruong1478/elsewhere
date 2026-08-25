/**
 * The open/closed status line, shared by the place card, the map preview and
 * both detail panels.
 *
 * These four had drifted into four near-identical copies of the same ladder,
 * which is how the closed case ended up as a bare "Closed" in six separate
 * string literals. One implementation means the next change to the wording
 * happens once.
 */

export type OpenStatusKind = "open" | "closing-soon" | "closed";

export type OpenStatus = { status: OpenStatusKind; label: string };

export type OpenStatusInput = {
  open_now: boolean;
  closes_at: string | null;
  closing_soon: boolean;
  open_late: boolean;
  opens_at: string | null;
};

/**
 * "Closed" on its own is a dead end: it tells the user this place is no good
 * *right now* and gives them nothing to do about it. Outside business hours
 * that is every card in the feed simultaneously. When the next opening is
 * known, say it.
 */
export function closedLabel(opensAt: string | null): string {
  return opensAt ? `Closed · opens ${opensAt}` : "Closed";
}

/**
 * `null` means "no status worth showing" — open, but with no closing time and
 * nothing else to say. Callers that must always render something supply their
 * own fallback.
 */
export function openStatusFrom(
  o: Pick<
    OpenStatusInput,
    "open_now" | "closes_at" | "closing_soon" | "open_late" | "opens_at"
  >,
): OpenStatus | null {
  if (o.closing_soon && o.closes_at) {
    return { status: "closing-soon", label: `Closing soon (${o.closes_at})` };
  }
  if (o.open_now && o.closes_at) {
    return { status: "open", label: `Open until ${o.closes_at}` };
  }
  if (!o.open_now) {
    return { status: "closed", label: closedLabel(o.opens_at) };
  }
  if (o.open_late) {
    return { status: "open", label: "Open" };
  }
  return null;
}
