/**
 * Google returns fully-qualified addresses — "9000 Burke Lake Rd, Burke, VA
 * 22015, USA". Every one of the seeded places ends in ", USA", which carries no
 * information for a Northern-Virginia-only product and costs real horizontal
 * space on a 390px card, where it was pushing the address into an ellipsis and
 * crowding the WiFi icon beside it.
 */

const COUNTRY_SUFFIX = /,\s*(USA|United States(?: of America)?)\s*$/i;
/** Trailing ZIP or ZIP+4, with the space before it. */
const TRAILING_ZIP = /\s+\d{5}(?:-\d{4})?\s*$/;

/** Drops the country. Use where the full address is the point (place detail). */
export function addressWithoutCountry(
  address: string | null | undefined,
): string {
  return (address ?? "").replace(COUNTRY_SUFFIX, "").trim();
}

/**
 * Drops the country and the ZIP: "9000 Burke Lake Rd, Burke, VA".
 *
 * For a card subtitle the street and town are what let someone place the venue;
 * the ZIP is only needed when you are actually navigating, and the full address
 * is still shown on the detail page.
 */
export function addressCompact(address: string | null | undefined): string {
  return addressWithoutCountry(address).replace(TRAILING_ZIP, "").trim();
}
