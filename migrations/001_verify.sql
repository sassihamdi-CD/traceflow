-- TraceFlow pilot verify: paste ALL of this into Supabase SQL Editor > Run.
-- (The bootstrap's own checks often get hidden; run this separately.)

SELECT 'field_definitions' AS t, COUNT(*) AS n FROM field_definitions
UNION ALL SELECT 'workspaces', COUNT(*) FROM workspaces;

-- Expected: two rows -> field_definitions = 7, workspaces >= 1.
