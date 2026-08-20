/**
 * Shared comment rules.
 *
 * Mirrored by the rating_comments CHECK constraint in
 * supabase/migrations/20260819000000_create_rating_likes_and_comments.sql —
 * changing this value requires a migration.
 */
export const MAX_COMMENT_LENGTH = 500;

/** Comments per user per rolling window, enforced in the POST handler. */
export const COMMENT_RATE_WINDOW_MS = 60_000;
export const COMMENT_RATE_MAX = 10;
