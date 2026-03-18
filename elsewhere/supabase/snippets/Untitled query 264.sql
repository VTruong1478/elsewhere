SELECT id, noise, vibe, tables, outlets, overall_rating
FROM ratings
WHERE place_id = (SELECT id FROM places WHERE name ILIKE '%breeze%');