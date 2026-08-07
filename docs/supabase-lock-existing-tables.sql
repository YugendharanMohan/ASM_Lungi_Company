-- ===========================================================================
-- Close Supabase's REST API over tables this app did not create.
--
-- Supabase serves PostgREST across the `public` schema and grants the `anon`
-- and `authenticated` roles access to tables created there. The publishable
-- (anon) key is meant to be embedded in client code, so it must be assumed
-- public — which means, on an untouched project, those tables are readable
-- and writable by anyone holding it.
--
-- Tables created by this app's migrations are already locked; see migration
-- 9a1c7f3d5e20. This script is for tables made by hand in the SQL editor, the
-- table editor, or by some earlier project sharing the same database.
--
-- Enabling row-level security with no policies denies every row to the roles
-- PostgREST uses. It does not affect anything connecting with the database
-- password, because the table owner bypasses RLS — so an app using a Postgres
-- connection string keeps working normally.
--
-- Run in: Supabase -> SQL Editor -> New query -> paste -> Run
-- ===========================================================================

-- 1. What is currently unprotected? Run this first.
SELECT c.relname AS unprotected_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity;

-- 2. Lock everything in the public schema.
DO $$
DECLARE t record;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 3. Re-run step 1. It should return no rows.

-- 4. Confirm from outside — this must return an error, not data:
--   curl -H "apikey: YOUR_PUBLISHABLE_KEY" \
--     "https://YOUR-PROJECT.supabase.co/rest/v1/YOUR_TABLE?select=*&limit=1"
