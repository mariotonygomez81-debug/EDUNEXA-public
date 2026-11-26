\set ON_ERROR_STOP on
-- Run after the complete Superadmin control-plane migrations in an isolated database.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"platform_role":"superadmin"},"role":"authenticated"}',false);
DO $$
DECLARE
  v_institution uuid;
  v_other uuid;
  v_role uuid;
  v_membership uuid;
  v_second_membership uuid;
  v_version timestamptz;
  v_result jsonb;
  v_repeat jsonb;
  v_events integer;
  v_event_id uuid;
  v_detail jsonb;
  v_cursor timestamptz;
  v_cursor_id uuid;
BEGIN
  INSERT INTO public.institutions(display_name,legal_name,slug,status)
  VALUES('Lifecycle Synthetic','Lifecycle Synthetic SA','lifecycle-synthetic','active')
  RETURNING id INTO v_institution;
  INSERT INTO public.institutions(display_name,legal_name,slug,status)
  VALUES('Lifecycle Other','Lifecycle Other SA','lifecycle-other','active')
  RETURNING id INTO v_other;
  SELECT id INTO v_role FROM public.roles WHERE key='institution_admin';

  INSERT INTO public.memberships(institution_id,user_id,status)
  VALUES(v_institution,'00000000-0000-4000-8000-000000000005','active')
  RETURNING id INTO v_membership;
  INSERT INTO public.membership_roles(membership_id,institution_id,role_id)
  VALUES(v_membership,v_institution,v_role);
  INSERT INTO public.memberships(institution_id,user_id,status)
  VALUES(v_institution,'00000000-0000-4000-8000-000000000006','active')
  RETURNING id INTO v_second_membership;
  INSERT INTO public.membership_roles(membership_id,institution_id,role_id)
  VALUES(v_second_membership,v_institution,v_role);

  SELECT updated_at INTO v_version FROM public.memberships WHERE id=v_membership;
  v_result:=public.platform_update_institution_admin(v_institution,v_membership,'Nombre local sintético',
    v_version,'Edición sintética de nombre institucional','synthetic-admin-edit-00001','synthetic-admin-edit-key-0001');
  v_repeat:=public.platform_update_institution_admin(v_institution,v_membership,'Nombre local sintético',
    v_version,'Edición sintética de nombre institucional','synthetic-admin-edit-00001','synthetic-admin-edit-key-0001');
  IF v_result<>v_repeat OR v_result->>'display_name'<>'Nombre local sintético' THEN
    RAISE EXCEPTION 'admin edit idempotency or override persistence failed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.platform_list_institution_admins(v_institution)
    WHERE membership_id=v_membership AND display_name='Nombre local sintético' AND updated_at=(v_result->>'updated_at')::timestamptz) THEN
    RAISE EXCEPTION 'administrator list did not return institution-scoped override/version';
  END IF;

  BEGIN
    PERFORM public.platform_update_institution_admin(v_institution,v_membership,'Nombre obsoleto',
      v_version,'Intento de edición con versión antigua','synthetic-admin-edit-stale-001','synthetic-admin-edit-stale-key');
    RAISE EXCEPTION 'expected optimistic version conflict';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  v_version:=(v_result->>'updated_at')::timestamptz;
  v_result:=public.platform_set_institution_admin_status(v_institution,v_membership,'suspended',
    v_version,'Suspensión sintética con control optimista','synthetic-admin-suspend-001','synthetic-admin-suspend-key-001');
  v_repeat:=public.platform_set_institution_admin_status(v_institution,v_membership,'suspended',
    v_version,'Suspensión sintética con control optimista','synthetic-admin-suspend-001','synthetic-admin-suspend-key-001');
  IF v_result<>v_repeat OR v_result->>'status'<>'suspended' THEN
    RAISE EXCEPTION 'admin suspension idempotency failed';
  END IF;

  v_version:=(v_result->>'updated_at')::timestamptz;
  v_result:=public.platform_set_institution_admin_status(v_institution,v_membership,'active',
    v_version,'Reactivación sintética de administrador','synthetic-admin-reactivate-001','synthetic-admin-reactivate-key-001');
  IF v_result->>'status'<>'active' THEN RAISE EXCEPTION 'administrator reactivation failed'; END IF;

  -- The institution lock serializes transitions and the last active administrator is protected.
  SELECT updated_at INTO v_version FROM public.memberships WHERE id=v_membership;
  PERFORM public.platform_set_institution_admin_status(v_institution,v_second_membership,'suspended',
    (SELECT updated_at FROM public.memberships WHERE id=v_second_membership),
    'Suspensión sintética de segundo administrador','synthetic-admin-suspend-second','synthetic-admin-suspend-second-key');
  BEGIN
    PERFORM public.platform_set_institution_admin_status(v_institution,v_membership,'suspended',
      v_version,'Intento de suspender al último administrador','synthetic-admin-suspend-last','synthetic-admin-suspend-last-key');
    RAISE EXCEPTION 'expected last active administrator protection';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- Membership IDs are bound to their institution; a manipulated tenant ID cannot change another roster.
  BEGIN
    PERFORM public.platform_set_institution_admin_status(v_other,v_membership,'suspended',
      v_version,'Intento de suspensión entre instituciones','synthetic-admin-cross-tenant','synthetic-admin-cross-tenant-key');
    RAISE EXCEPTION 'expected cross-tenant membership denial';
  EXCEPTION WHEN no_data_found THEN NULL; END;

  SELECT id INTO v_event_id FROM private.platform_audit_events
  WHERE action='platform.institution.admin.update' AND target_id=v_membership::text
  ORDER BY occurred_at DESC,id DESC LIMIT 1;
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'admin update audit event missing'; END IF;
  v_detail:=public.platform_get_audit_event(v_event_id);
  IF v_detail->>'id'<>v_event_id::text OR v_detail->>'action'<>'platform.institution.admin.update' THEN
    RAISE EXCEPTION 'audit detail endpoint returned incorrect event';
  END IF;

  SELECT count(*) INTO v_events FROM public.platform_list_audit_events(
    100,null,v_institution,null,'platform.institution.admin.update',null,'success','synthetic-admin-edit-00001'
  );
  IF v_events<1 THEN RAISE EXCEPTION 'audit text/action/institution filters did not return matching event'; END IF;

  INSERT INTO private.platform_audit_events(
    id,occurred_at,actor_user_id,action,target_type,target_id,institution_id,reason,request_id,outcome,metadata_redacted
  ) VALUES
    ('20000000-0000-4000-8000-000000000002','2020-01-01T00:00:00Z',
      '00000000-0000-4000-8000-000000000002','audit.cursor.synthetic','synthetic','cursor-two',v_institution,
      'Evento sintético de cursor compuesto','synthetic-cursor-event-0002','success','{}'::jsonb),
    ('20000000-0000-4000-8000-000000000001','2020-01-01T00:00:00Z',
      '00000000-0000-4000-8000-000000000002','audit.cursor.synthetic','synthetic','cursor-one',v_institution,
      'Evento sintético de cursor compuesto','synthetic-cursor-event-0001','success','{}'::jsonb);
  SELECT occurred_at,id INTO v_cursor,v_cursor_id
  FROM public.platform_list_audit_events(1,null,v_institution,null,'audit.cursor.synthetic',null,'success',null);
  IF v_cursor_id<>'20000000-0000-4000-8000-000000000002' OR NOT EXISTS(
    SELECT 1 FROM public.platform_list_audit_events(100,v_cursor,v_institution,v_cursor_id,'audit.cursor.synthetic',null,'success',null)
    WHERE id='20000000-0000-4000-8000-000000000001'
      AND (occurred_at,id)<(v_cursor,v_cursor_id)
  ) THEN RAISE EXCEPTION 'composite audit cursor failed to advance across equal timestamps'; END IF;

  IF NOT EXISTS(SELECT 1 FROM private.platform_audit_events
    WHERE action='platform.institution.admin.status' AND target_id=v_membership::text)
    OR NOT EXISTS(SELECT 1 FROM private.platform_institution_admin_overrides WHERE membership_id=v_membership) THEN
    RAISE EXCEPTION 'admin lifecycle changes or scoped display-name override were not persisted/audited';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='private.platform_institution_admin_overrides'::regclass)
    OR has_table_privilege('authenticated','private.platform_institution_admin_overrides','SELECT') THEN
    RAISE EXCEPTION 'institution admin override table must be RLS-protected and inaccessible to authenticated clients';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","app_metadata":{},"role":"authenticated"}',false);
DO $$
DECLARE v_event uuid;
BEGIN
  SELECT id INTO v_event FROM private.platform_audit_events LIMIT 1;
  BEGIN
    PERFORM public.platform_get_audit_event(v_event);
    RAISE EXCEPTION 'expected ordinary identity audit detail denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT 'PASS: Superadmin audit filters/detail/composite cursor and institution admin edit/suspend/idempotency/optimistic locking/tenant isolation' AS result;
