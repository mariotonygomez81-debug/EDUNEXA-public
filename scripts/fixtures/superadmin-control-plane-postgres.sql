\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
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
  tax_id text,
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


-- Synthetic institutional configuration tables used by clone snapshot synchronization.
CREATE TABLE IF NOT EXISTS public.grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  display_mode text NOT NULL DEFAULT 'numeric',
  minimum_value numeric(8,2) NOT NULL DEFAULT 1,
  maximum_value numeric(8,2) NOT NULL DEFAULT 10,
  passing_value numeric(8,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,institution_id),
  UNIQUE(institution_id,name)
);
CREATE TABLE IF NOT EXISTS public.grading_scale_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  grading_scale_id uuid NOT NULL,
  minimum_percentage numeric(5,2) NOT NULL,
  maximum_percentage numeric(5,2) NOT NULL,
  label text NOT NULL,
  grade_value numeric(8,2),
  is_passing boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(grading_scale_id,institution_id) REFERENCES public.grading_scales(id,institution_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  grading_scale_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,institution_id),
  FOREIGN KEY(grading_scale_id,institution_id) REFERENCES public.grading_scales(id,institution_id),
  CHECK(ends_on>starts_on)
);
CREATE TABLE IF NOT EXISTS public.grading_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(id,institution_id),
  FOREIGN KEY(academic_year_id,institution_id) REFERENCES public.academic_years(id,institution_id),
  CHECK(ends_on>=starts_on)
);
CREATE TABLE IF NOT EXISTS public.education_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,institution_id)
);
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  level_id uuid NOT NULL,
  name text NOT NULL,
  grade_number integer,
  shift text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,institution_id),
  FOREIGN KEY(level_id,institution_id) REFERENCES public.education_levels(id,institution_id)
);
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,institution_id)
);
CREATE TABLE IF NOT EXISTS public.course_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  weekly_hours numeric(4,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(course_id,institution_id) REFERENCES public.courses(id,institution_id),
  FOREIGN KEY(subject_id,institution_id) REFERENCES public.subjects(id,institution_id)
);

CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  address text,
  phone text,
  is_main boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,institution_id),
  UNIQUE(institution_id,name),
  UNIQUE(institution_id,code)
);
CREATE UNIQUE INDEX IF NOT EXISTS campuses_one_main_per_institution_unique
  ON public.campuses(institution_id) WHERE is_main;
CREATE TABLE IF NOT EXISTS public.divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  campus_id uuid,
  academic_year_id uuid NOT NULL,
  name text NOT NULL,
  capacity integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,institution_id),
  FOREIGN KEY(course_id,institution_id) REFERENCES public.courses(id,institution_id),
  FOREIGN KEY(campus_id,institution_id) REFERENCES public.campuses(id,institution_id),
  FOREIGN KEY(academic_year_id,institution_id) REFERENCES public.academic_years(id,institution_id)
);
