SELECT 
  p.name,
  ps.rating_count,
  ps.noise_silent, ps.noise_quiet, ps.noise_vibrant,
  ps.vibe_focused, ps.vibe_casual, ps.vibe_social,
  ps.tables_limited, ps.tables_mixed, ps.tables_plentiful,
  ps.outlets_scarce, ps.outlets_some, ps.outlets_ample
FROM places p
JOIN place_stats ps ON ps.place_id = p.id
WHERE p.name ILIKE '%breeze%';