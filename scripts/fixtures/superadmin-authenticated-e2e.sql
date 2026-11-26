\set ON_ERROR_STOP on

-- Local-only fixture. This file must only be executed against Supabase CLI's
-- disposable local database after the repository migrations have been applied.
INSERT INTO public.institutions (
  id, display_name, legal_name, slug, status, locale, timezone
) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Institución E2E Uno', 'Institución E2E Uno S.A.', 'edunexa-e2e-uno', 'active', 'es-AR', 'America/Argentina/Buenos_Aires'),
  ('10000000-0000-4000-8000-000000000002', 'Institución E2E Dos', 'Institución E2E Dos S.A.', 'edunexa-e2e-dos', 'active', 'es-AR', 'America/Argentina/Buenos_Aires')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  legal_name = EXCLUDED.legal_name,
  slug = EXCLUDED.slug,
  status = EXCLUDED.status;

DO $$
DECLARE
  v_admin_user uuid;
  v_role_id uuid;
  v_membership_id uuid;
BEGIN
  SELECT id INTO v_admin_user
  FROM auth.users
  WHERE email = 'superadmin-a@edunexa.test';

  SELECT id INTO v_role_id
  FROM public.roles
  WHERE key = 'institution_admin';

  IF v_admin_user IS NULL OR v_role_id IS NULL THEN
    RAISE EXCEPTION 'Synthetic Superadmin or institution_admin role is missing';
  END IF;

  INSERT INTO public.memberships (institution_id, user_id, status)
  VALUES ('10000000-0000-4000-8000-000000000001', v_admin_user, 'active')
  ON CONFLICT (institution_id, user_id)
  DO UPDATE SET status = 'active'
  RETURNING id INTO v_membership_id;

  INSERT INTO public.membership_roles (membership_id, institution_id, role_id)
  VALUES (v_membership_id, '10000000-0000-4000-8000-000000000001', v_role_id)
  ON CONFLICT DO NOTHING;
END;
$$;

SELECT 'PASS: local-only Superadmin HTTP E2E tenant fixtures seeded' AS result;
