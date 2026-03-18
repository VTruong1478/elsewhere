SELECT 
  p.name,
  ps.tables_limited,
  ps.tables_mixed,
  ps.tables_plentiful
FROM place_stats ps
JOIN places p ON p.id = ps.place_id
WHERE p.name ILIKE '%fairfax%' AND p.place_type = 'library';