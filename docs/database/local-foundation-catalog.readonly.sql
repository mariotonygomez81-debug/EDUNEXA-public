-- EDUNEXA foundation inventory: READ-ONLY catalog queries.
-- This file contains SELECT statements only. It does not create or alter schema,
-- insert/update/delete rows, or inspect application/student records.

\echo '1. User tables and RLS flags (public/private)'
SELECT n.nspname AS schema_name,
       c.relname AS object_name,
       c.relkind AS object_kind,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'private')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
ORDER BY n.nspname, c.relname;

\echo '2. Columns'
SELECT table_schema, table_name, ordinal_position, column_name,
       data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema IN ('public', 'private')
ORDER BY table_schema, table_name, ordinal_position;

\echo '3. Constraints'
SELECT n.nspname AS schema_name, c.relname AS table_name,
       con.conname AS constraint_name,
       CASE con.contype
         WHEN 'p' THEN 'PRIMARY KEY'
         WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'u' THEN 'UNIQUE'
         WHEN 'c' THEN 'CHECK'
         WHEN 'x' THEN 'EXCLUSION'
         ELSE con.contype::text
       END AS constraint_type,
       pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'private')
ORDER BY n.nspname, c.relname, con.conname;

\echo '4. Indexes'
SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname IN ('public', 'private')
ORDER BY schemaname, tablename, indexname;

\echo '5. RLS policies'
SELECT schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname IN ('public', 'private')
ORDER BY schemaname, tablename, policyname;

\echo '6. User-defined triggers'
SELECT event_object_schema AS schema_name,
       event_object_table AS table_name,
       trigger_name, event_manipulation, action_timing,
       action_orientation, action_statement
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'private', 'auth')
ORDER BY event_object_schema, event_object_table, trigger_name;

\echo '7. Routine metadata (no function bodies)'
SELECT n.nspname AS schema_name, p.proname AS routine_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       p.prokind AS routine_kind,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       p.proconfig AS function_settings
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private')
ORDER BY n.nspname, p.proname, identity_arguments;

\echo '8. Table grants'
SELECT table_schema, table_name, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'private')
ORDER BY table_schema, table_name, grantee, privilege_type;

\echo '9. Installed extensions'
SELECT e.extname, e.extversion, n.nspname AS extension_schema
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;
