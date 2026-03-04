-- Allow unauthenticated feed for now (bypass sign-in).
-- Revoke or drop this migration when you require auth again.
GRANT EXECUTE ON FUNCTION get_feed_places(double precision, double precision, double precision, text, text) TO anon;
