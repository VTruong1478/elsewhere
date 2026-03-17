SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version DESC 
LIMIT 10;