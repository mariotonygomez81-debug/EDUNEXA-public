\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE TABLE IF NOT EXISTS public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  legal_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  locale text NOT NULL DEFAULT 'es-AR',
  timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.membership_roles (
  membership_id uuid NOT NULL REFERENCES public.memberships(id),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  role_id uuid NOT NULL REFERENCES public.roles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(membership_id,role_id)
);

INSERT INTO auth.users(id,raw_app_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000001','{"platform_role":"superadmin"}'),
 ('00000000-0000-4000-8000-000000000002','{"platform_role":"superadmin"}'),
 ('00000000-0000-4000-8000-000000000003','{"platform_role":"superadmin"}'),
 ('00000000-0000-4000-8000-000000000004','{}'),
 ('00000000-0000-4000-8000-000000000005','{}')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.roles(key,name) VALUES('institution_admin','Administrador institucional')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY, display_name text);
