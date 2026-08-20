/**
 * Shared profile validation rules.
 *
 * Used by the username availability check, the profile PATCH handler, and the
 * edit modals so the client and server cannot drift apart.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const FULL_NAME_MAX_LENGTH = 80;

/** Lowercase letters, digits and underscores only. */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * Usernames that would collide with real routes or read as official.
 * Profiles are linked as /profile/<id>, but these are still reserved so a
 * username can never be mistaken for a system account.
 */
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "elsewhere",
  "feed",
  "help",
  "login",
  "logout",
  "map",
  "me",
  "moderator",
  "null",
  "places",
  "privacy",
  "profile",
  "saved",
  "settings",
  "signup",
  "support",
  "system",
  "terms",
  "undefined",
]);

/** Normalizes user input to the stored form. */
export function sanitizeUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

/** Returns a user-facing message when invalid, or null when acceptable. */
export function validateUsername(raw: string): string | null {
  const username = raw.trim().toLowerCase();

  if (username.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Username can only use letters, numbers and underscores";
  }
  if (RESERVED_USERNAMES.has(username)) {
    return "That username isn't available";
  }
  return null;
}

/** Returns a user-facing message when invalid, or null when acceptable. */
export function validateFullName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return "Name cannot be empty";
  if (name.length > FULL_NAME_MAX_LENGTH) {
    return `Name must be ${FULL_NAME_MAX_LENGTH} characters or fewer`;
  }
  return null;
}
