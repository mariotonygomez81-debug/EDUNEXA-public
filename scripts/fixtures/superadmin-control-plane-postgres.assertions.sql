\set ON_ERROR_STOP on
CREATE TEMP TABLE synthetic_results (
  institution_id uuid,
  second_institution_id uuid,
  source_campus_id uuid,
  delegation_id uuid,
  self_delegation_id uuid,
  clone_job_id uuid,
  clone_target_id uuid,
  superadmin_change_id uuid,
  ai_plan_id uuid
);

-- No identity and user_metadata-only claims must be denied.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","user_metadata":{"platform_role":"superadmin"},"app_metadata":{}}',false);
DO $$ BEGIN
  PERFORM * FROM public.platform_list_institutions(10,null,null,null);
  RAISE EXCEPTION 'expected user_metadata-only identity to be denied';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- A trusted Superadministrator creates a pending institution idempotently.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
INSERT INTO synthetic_results(institution_id)
SELECT (public.platform_create_institution(
  'Colegio Sintético Uno','Colegio Sintético Uno S.A.','colegio-sintetico-uno',
  'Alta de institución ficticia para prueba automatizada','synthetic-request-0001','synthetic-idempotency-0001'
)->>'id')::uuid;

-- Seed real, synthetic institution settings; triggers must mirror only safe configuration.
DO $$
DECLARE v_institution uuid; v_level uuid; v_year uuid; v_scale uuid; v_course uuid; v_subject uuid; v_division uuid; v_campus uuid; v_second uuid;
BEGIN
  SELECT institution_id INTO v_institution FROM synthetic_results;
  INSERT INTO public.grading_scales(institution_id,name,description,display_mode,minimum_value,maximum_value,passing_value)
    VALUES(v_institution,'Escala sintética','Configuración académica de prueba','numeric',1,10,6) RETURNING id INTO v_scale;
  INSERT INTO public.grading_scale_levels(institution_id,grading_scale_id,minimum_percentage,maximum_percentage,label,grade_value,is_passing,sort_order)
    VALUES(v_institution,v_scale,0,100,'Aprobado',6,true,1);
  INSERT INTO public.academic_years(institution_id,name,starts_on,ends_on,status,grading_scale_id)
    VALUES(v_institution,'2027','2027-03-01','2027-12-15','planned',v_scale) RETURNING id INTO v_year;
  INSERT INTO public.grading_periods(institution_id,academic_year_id,name,starts_on,ends_on,sort_order)
    VALUES(v_institution,v_year,'Primer período','2027-03-01','2027-07-01',1);
  INSERT INTO public.education_levels(institution_id,name,code,sort_order)
    VALUES(v_institution,'Secundario','SEC',1) RETURNING id INTO v_level;
  INSERT INTO public.courses(institution_id,level_id,name,grade_number,shift)
    VALUES(v_institution,v_level,'Primer año',1,'morning') RETURNING id INTO v_course;
  INSERT INTO public.campuses(institution_id,name,code,address,phone,is_main)
    VALUES(v_institution,'Sede Central','CENTRAL','Calle privada 123','+54-11-5555-0101',true)
    RETURNING id INTO v_campus;
  UPDATE synthetic_results SET source_campus_id=v_campus;
  INSERT INTO public.divisions(institution_id,course_id,campus_id,academic_year_id,name,capacity)
    VALUES(v_institution,v_course,v_campus,v_year,'A',30) RETURNING id INTO v_division;
  INSERT INTO public.subjects(institution_id,name,code) VALUES(v_institution,'Matemática','MAT') RETURNING id INTO v_subject;
  INSERT INTO public.course_subjects(institution_id,course_id,subject_id,weekly_hours)
    VALUES(v_institution,v_course,v_subject,4);
  IF NOT EXISTS (
    SELECT 1 FROM private.platform_institution_clone_config
    WHERE institution_id=v_institution AND config_key='academic_structure'
      AND jsonb_array_length(config_value->'education_levels')=1
      AND jsonb_array_length(config_value->'campuses')=1
      AND config_value->'campuses'->0->>'name'='Sede Central'
      AND NOT ((config_value->'campuses'->0) ? 'address')
      AND NOT ((config_value->'campuses'->0) ? 'phone')
  ) THEN RAISE EXCEPTION 'safe institutional settings must synchronize without campus contact fields'; END IF;

  v_second:=(public.platform_create_institution(
    'Colegio Sintético Dos','Colegio Sintético Dos S.A.','colegio-sintetico-dos',
    'Segunda institución ficticia para aislamiento multi-tenant','synthetic-request-0003','synthetic-idempotency-0002'
  )->>'id')::uuid;
  UPDATE synthetic_results SET second_institution_id=v_second;
  INSERT INTO public.campuses(institution_id,name,code,address,phone,is_main)
    VALUES(v_second,'Sede Exclusiva Dos','DOS','Dirección de prueba Dos','+54-11-5555-0202',true);
END $;
DO $
DECLARE v_first uuid; v_second uuid;
BEGIN
  SELECT institution_id,second_institution_id INTO v_first,v_second FROM synthetic_results;
  IF NOT EXISTS(SELECT 1 FROM private.platform_institution_clone_config
    WHERE institution_id=v_first AND config_key='academic_structure'
      AND config_value->'campuses'->0->>'name'='Sede Central')
    OR NOT EXISTS(SELECT 1 FROM private.platform_institution_clone_config
    WHERE institution_id=v_second AND config_key='academic_structure'
      AND config_value->'campuses'->0->>'name'='Sede Exclusiva Dos')
    OR EXISTS(SELECT 1 FROM private.platform_institution_clone_config
    WHERE institution_id=v_first AND config_key='academic_structure'
      AND config_value::text LIKE '%Sede Exclusiva Dos%') THEN
    RAISE EXCEPTION 'two institutions must keep independent campus configuration snapshots';
  END IF;
END $;
DO $$
DECLARE v_first uuid; v_second uuid; v_count integer;
BEGIN
  SELECT institution_id INTO v_first FROM synthetic_results;
  v_second := (public.platform_create_institution(
    'Colegio Sintético Uno','Colegio Sintético Uno S.A.','colegio-sintetico-uno',
    'Alta de institución ficticia para prueba automatizada','synthetic-request-0002','synthetic-idempotency-0001'
  )->>'id')::uuid;
  IF v_first IS DISTINCT FROM v_second THEN RAISE EXCEPTION 'idempotent retry returned a different institution'; END IF;
  SELECT count(*) INTO v_count FROM public.institutions WHERE slug='colegio-sintetico-uno';
  IF v_count<>1 THEN RAISE EXCEPTION 'idempotency created duplicate institutions'; END IF;
END $$;

-- Verify Superadministrator and institution-administrator registries are restricted and scoped.
DO $$
DECLARE v_id uuid; v_super_count integer; v_admin_count integer;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  SELECT count(*) INTO v_super_count FROM public.platform_list_superadmins();
  IF v_super_count<>3 THEN RAISE EXCEPTION 'global Superadministrator registry must show only trusted superadmins'; END IF;
  SELECT count(*) INTO v_admin_count FROM public.platform_list_institution_admins(v_id);
  IF v_admin_count<>0 THEN RAISE EXCEPTION 'new institution must not have administrators'; END IF;
END $$;

-- Activate with optimistic concurrency and assign two administrators.
DO $$
DECLARE v_id uuid; v_version timestamptz;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  SELECT updated_at INTO v_version FROM public.institutions WHERE id=v_id;
  PERFORM public.platform_update_institution(v_id,'Colegio Sintético Uno Actualizado','Colegio Sintético Uno Actualizado S.A.','es-AR','America/Argentina/Buenos_Aires',v_version,
    'Actualización sintética de los datos generales','synthetic-request-update-001','synthetic-update-key-00001');
  SELECT updated_at INTO v_version FROM public.institutions WHERE id=v_id;
  PERFORM public.platform_set_institution_status(v_id,'active',v_version,
    'Activación sintética luego de verificar la ficha','synthetic-request-status-001','synthetic-status-key-0001');
  IF NOT EXISTS(SELECT 1 FROM public.institutions WHERE id=v_id AND display_name='Colegio Sintético Uno Actualizado') THEN RAISE EXCEPTION 'institution profile update failed'; END IF;
  PERFORM public.platform_assign_institution_admin(v_id,'00000000-0000-4000-8000-000000000004',
    'Asignación sintética de administrador institucional','synthetic-request-admin-001','synthetic-admin-key-00001');
  PERFORM public.platform_assign_institution_admin(v_id,'00000000-0000-4000-8000-000000000005',
    'Asignación sintética de segundo administrador','synthetic-request-admin-002','synthetic-admin-key-00002');
END $$;

-- Administrator list is scoped to one institution and reflects active and inactive memberships.
DO $$
DECLARE v_id uuid; v_count integer;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  SELECT count(*) INTO v_count FROM public.platform_list_institution_admins(v_id);
  IF v_count<>2 THEN RAISE EXCEPTION 'institution administrator registry must return both assigned administrators'; END IF;
END $$;

-- Revoking one administrator is allowed; revoking the last one is rejected.
DO $$
DECLARE v_id uuid; v_membership uuid; v_last uuid;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  SELECT id INTO v_membership FROM public.memberships WHERE institution_id=v_id AND user_id='00000000-0000-4000-8000-000000000004';
  SELECT id INTO v_last FROM public.memberships WHERE institution_id=v_id AND user_id='00000000-0000-4000-8000-000000000005';
  PERFORM public.platform_revoke_institution_admin(v_id,v_membership,
    'Revocación sintética de un administrador','synthetic-request-revoke-001','synthetic-revoke-key-0001');
  BEGIN
    PERFORM public.platform_revoke_institution_admin(v_id,v_last,
      'Intento sintético de revocar al último administrador','synthetic-request-revoke-002','synthetic-revoke-key-0002');
    RAISE EXCEPTION 'expected last institution administrator protection';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Delegation requires a distinct second Superadministrator and expires within 30 minutes.
DO $$
DECLARE v_id uuid; v_delegation uuid;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  v_delegation:=(public.platform_request_delegation_scoped_idempotent(v_id,'Asistencia técnica sintética solicitada',
    now()+interval '15 minutes',ARRAY['docentes','preceptor','alumnos','tutor','directivos','administrativos','administrador'],
    'synthetic-request-delegation-001','synthetic-delegation-idempotency-01')->>'delegation_id')::uuid;
  IF (public.platform_request_delegation_scoped_idempotent(v_id,'Asistencia técnica sintética solicitada',
    (SELECT expires_at FROM private.platform_delegations WHERE id=v_delegation),ARRAY['docentes'],
    'synthetic-request-delegation-retry','synthetic-delegation-idempotency-01')->>'delegation_id')::uuid IS DISTINCT FROM v_delegation THEN
    RAISE EXCEPTION 'delegation idempotency key must return the original request';
  END IF;
  UPDATE synthetic_results SET delegation_id=v_delegation;
  BEGIN
    PERFORM public.platform_request_delegation_scoped_idempotent(v_id,'Prueba de vencimiento fuera del máximo',
      now()+interval '1 hour',ARRAY['administrador'],'synthetic-request-delegation-003','synthetic-delegation-invalid-expiry');
    RAISE EXCEPTION 'expected delegation maximum lifetime protection';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"platform_role":"superadmin"}}',false);
SELECT public.platform_approve_delegation(delegation_id,'synthetic-request-delegation-approve-001')
FROM synthetic_results WHERE delegation_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.platform_delegations WHERE status='active' AND approved_by='00000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'delegation was not activated by second Superadministrator';
  END IF;
END $$;

-- Only the requesting Superadministrator can resolve the active delegated context.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_id uuid; v_context jsonb; v_module text;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  v_context:=public.platform_resolve_delegated_context(v_id);
  IF v_context->>'mode'<>'delegated_support_read_only'
    OR jsonb_array_length(to_jsonb(v_context->'module_scope'))<>7
    OR (v_context->>'expires_at')::timestamptz<=now() THEN
    RAISE EXCEPTION 'delegated context must include all seven explicitly approved read-only modules';
  END IF;
  FOR v_module IN SELECT unnest(ARRAY['docentes','preceptor','alumnos','tutor','directivos','administrativos','administrador'])
  LOOP
    v_context:=public.platform_read_delegated_module(
      (SELECT delegation_id FROM synthetic_results),v_module);
    IF v_context->>'read_only'<>'true'
      OR jsonb_typeof(v_context->'configuration')<>'object'
      OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_context->'configuration') k
        WHERE NOT (k=ANY(CASE v_module
          WHEN 'docentes' THEN ARRAY['academic_structure']
          WHEN 'preceptor' THEN ARRAY['academic_structure','academic_calendar']
          WHEN 'alumnos' THEN ARRAY['academic_calendar','grading_scales']
          WHEN 'tutor' THEN ARRAY['academic_calendar']
          WHEN 'directivos' THEN ARRAY['academic_calendar','grading_scales','academic_structure']
          WHEN 'administrativos' THEN ARRAY['academic_structure']
          WHEN 'administrador' THEN ARRAY['academic_calendar','grading_scales','academic_structure','branding','module_settings']
        END))
      ) THEN
      RAISE EXCEPTION 'delegated module % exceeded its read-only configuration allowlist',v_module;
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.platform_read_delegated_module((SELECT delegation_id FROM synthetic_results),'superadmin');
    RAISE EXCEPTION 'expected unknown module denial';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  v_context:=public.platform_resolve_delegated_context_by_slug('colegio-sintetico-uno');
  IF v_context->'institution'->>'slug'<>'colegio-sintetico-uno'
    OR v_context->>'mode'<>'delegated_support_read_only' THEN
    RAISE EXCEPTION 'delegated workspace must resolve through institution slug under RLS';
  END IF;
END $$;

-- Narrow the grant for the direct RLS test after exercising all seven module RPC scopes.
UPDATE private.platform_delegations SET module_scope=ARRAY['docentes']
WHERE id=(SELECT delegation_id FROM synthetic_results);

-- RLS defense-in-depth: a docentes grant can SELECT only academic_structure snapshots.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON private.platform_institution_clone_config TO authenticated;
SELECT set_config('test.institution_id',(SELECT institution_id::text FROM synthetic_results),false);
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',true);
DO $$
DECLARE v_structure integer; v_scales integer; v_scope boolean;
BEGIN
  v_scope:=private.has_active_delegated_module_scope(current_setting('test.institution_id')::uuid,'docentes');
  SELECT count(*) INTO v_structure FROM private.platform_institution_clone_config
    WHERE institution_id=current_setting('test.institution_id')::uuid AND config_key='academic_structure';
  SELECT count(*) INTO v_scales FROM private.platform_institution_clone_config
    WHERE institution_id=current_setting('test.institution_id')::uuid AND config_key='grading_scales';
  IF NOT v_scope OR v_structure<>1 OR v_scales<>0 THEN
    RAISE EXCEPTION 'module RLS must allow only the categories assigned to docentes (scope %, structure %, scales %)',v_scope,v_structure,v_scales;
  END IF;
END $$;
RESET ROLE;
COMMIT;

UPDATE private.platform_delegations
SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 second'
WHERE id=(SELECT delegation_id FROM synthetic_results);
DO $$
BEGIN
  BEGIN
    PERFORM public.platform_read_delegated_module((SELECT delegation_id FROM synthetic_results),'docentes');
    RAISE EXCEPTION 'expected expired delegation denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- An active support delegation can be revoked and the action is audited.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
SELECT public.platform_revoke_delegation(delegation_id,'Cierre de asistencia sintética completada','synthetic-request-delegation-revoke')
FROM synthetic_results WHERE delegation_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.platform_delegations WHERE status='revoked') THEN
    RAISE EXCEPTION 'delegation was not revoked';
  END IF;
END $$;

-- The requester cannot approve their own delegation.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_id uuid; v_self uuid;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  v_self:=(public.platform_request_delegation_scoped_idempotent(v_id,'Solicitud propia de soporte sintético para validar doble aprobación',
    now()+interval '10 minutes',ARRAY['directivos'],
    'synthetic-request-delegation-self-001','synthetic-delegation-self-key-001')->>'delegation_id')::uuid;
  UPDATE synthetic_results SET self_delegation_id=v_self;
  BEGIN
    PERFORM public.platform_approve_delegation(v_self,'synthetic-request-delegation-self-approve');
    RAISE EXCEPTION 'expected independent delegation approval';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- Clone request creates an isolated pending tenant and a configuration-only job.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_source uuid; v_result jsonb;
BEGIN
  SELECT institution_id INTO v_source FROM synthetic_results;
  v_result:=public.platform_request_clone_idempotent(v_source,'Colegio Clonado Sintético','Colegio Clonado Sintético S.A.',
    'colegio-clonado-sintetico','Clonación sintética sin expedientes ni datos personales',
    'synthetic-request-clone-001','synthetic-clone-idempotency-0001');
  UPDATE synthetic_results SET clone_job_id=(v_result->>'job_id')::uuid,clone_target_id=(v_result->>'target_institution_id')::uuid;
  IF (public.platform_request_clone_idempotent(v_source,'Colegio Clonado Sintético','Colegio Clonado Sintético S.A.',
    'colegio-clonado-sintetico','Clonación sintética sin expedientes ni datos personales',
    'synthetic-request-clone-retry','synthetic-clone-idempotency-0001')->>'job_id')::uuid
      IS DISTINCT FROM (v_result->>'job_id')::uuid THEN
    RAISE EXCEPTION 'clone idempotency key must return the original job';
  END IF;
END $$;
DO $$
DECLARE v_job private.platform_clone_jobs%rowtype;
BEGIN
  SELECT * INTO v_job FROM private.platform_clone_jobs WHERE id=(SELECT clone_job_id FROM synthetic_results);
  IF v_job.copy_mode<>'configuration_only' OR v_job.status<>'pending_approval' THEN RAISE EXCEPTION 'clone job must wait for independent approval'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.institutions WHERE id=v_job.target_institution_id AND status='pending') THEN
    RAISE EXCEPTION 'clone target must remain pending';
  END IF;
END $$;

-- The clone requester cannot approve their own job; a second Superadministrator releases it to the worker.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT clone_job_id INTO v_id FROM synthetic_results;
  BEGIN
    PERFORM public.platform_approve_clone_job(v_id,'synthetic-request-clone-self-approve');
    RAISE EXCEPTION 'expected independent clone approval';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  SELECT clone_job_id INTO v_id FROM synthetic_results;
  v_result:=public.platform_approve_clone_job(v_id,'synthetic-request-clone-approve-001');
  IF v_result->>'status'<>'queued' THEN RAISE EXCEPTION 'second approver must release clone job'; END IF;
END $$;

-- The worker copies only approved non-personal configuration categories and is idempotent.
INSERT INTO private.platform_institution_clone_config(institution_id,config_key,config_value)
SELECT institution_id,'branding','{"primary_color":"#123456","logo_variant":"school"}'::jsonb FROM synthetic_results;
DO $$
BEGIN
  IF private.platform_clone_json_is_safe('{"student_name":"Synthetic Student"}'::jsonb)
    OR private.platform_clone_json_is_safe('{"contact_email":"synthetic@example.test"}'::jsonb) THEN
    RAISE EXCEPTION 'clone configuration validator must reject personal data';
  END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"},"role":"authenticated"}',false);
DO $$
BEGIN
  BEGIN
    PERFORM public.platform_claim_clone_job(180);
    RAISE EXCEPTION 'expected non-worker claim denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"},"role":"service_role"}',false);
DO $$
DECLARE v_claim jsonb; v_job uuid; v_target uuid; v_result jsonb;
BEGIN
  v_claim:=public.platform_claim_clone_job(180);
  IF v_claim IS NULL OR v_claim->>'copy_mode'<>'configuration_only' THEN
    RAISE EXCEPTION 'service worker must claim a configuration-only job';
  END IF;
  v_job:=(v_claim->>'id')::uuid;
  v_target:=(v_claim->>'target_institution_id')::uuid;
  v_result:=public.platform_finish_clone_job(v_job,false,'synthetic_transient_failure');
  IF v_result->>'status'<>'queued' THEN RAISE EXCEPTION 'transient worker failure must requeue the approved job'; END IF;
  v_claim:=public.platform_claim_clone_job(180);
  IF v_claim IS NULL OR (v_claim->>'id')::uuid IS DISTINCT FROM v_job THEN
    RAISE EXCEPTION 'requeued clone job must be recoverable by the worker';
  END IF;
  v_result:=public.platform_finish_clone_job(v_job,true,null);
  IF v_result->>'status'<>'completed' OR v_result->>'personal_data_copied'<>'false' THEN
    RAISE EXCEPTION 'clone worker completion must confirm no personal data';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.platform_institution_clone_config WHERE institution_id=v_target AND config_key='branding') THEN
    RAISE EXCEPTION 'allowlisted branding configuration was not copied';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.platform_institution_clone_config
    WHERE institution_id=v_target AND config_key='academic_structure'
      AND jsonb_array_length(config_value->'education_levels')=1) THEN
    RAISE EXCEPTION 'synchronized academic settings were not copied to the cloned tenant';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.campuses WHERE institution_id=v_target AND name='Sede Central'
      AND code='CENTRAL' AND is_main AND address IS NULL AND phone IS NULL)
    OR EXISTS(SELECT 1 FROM public.campuses WHERE institution_id=v_target AND name='Sede Exclusiva Dos') THEN
    RAISE EXCEPTION 'configuration-only clone must copy only safe campus identity and preserve tenant isolation';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.divisions d
    JOIN public.campuses cp ON cp.id=d.campus_id AND cp.institution_id=d.institution_id
    WHERE d.institution_id=v_target AND d.name='A' AND cp.name='Sede Central')
    OR EXISTS(SELECT 1 FROM public.divisions d WHERE d.institution_id=v_target AND d.campus_id=(SELECT source_campus_id FROM synthetic_results)) THEN
    RAISE EXCEPTION 'cloned division must reference a newly mapped target campus id';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.education_levels WHERE institution_id=v_target AND name='Secundario')
    OR NOT EXISTS(SELECT 1 FROM public.academic_years WHERE institution_id=v_target AND name='2027' AND status='planned')
    OR NOT EXISTS(SELECT 1 FROM public.grading_scales WHERE institution_id=v_target AND name='Escala sintética')
    OR NOT EXISTS(SELECT 1 FROM public.courses WHERE institution_id=v_target AND name='Primer año')
    OR NOT EXISTS(SELECT 1 FROM public.divisions WHERE institution_id=v_target AND name='A' AND capacity=30)
    OR NOT EXISTS(SELECT 1 FROM public.subjects WHERE institution_id=v_target AND name='Matemática')
    OR NOT EXISTS(SELECT 1 FROM public.course_subjects cs WHERE cs.institution_id=v_target) THEN
    RAISE EXCEPTION 'configuration-only clone must materialize academic settings in the target institution';
  END IF;
  IF EXISTS(SELECT 1 FROM public.memberships WHERE institution_id=v_target) THEN
    RAISE EXCEPTION 'clone worker must never copy institutional memberships';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);

-- Global privilege changes require a second approver and a recorded execution saga.
DO $$
DECLARE v_id uuid;
BEGIN
  v_id:=public.platform_create_superadmin_change('00000000-0000-4000-8000-000000000004','grant',
    'Alta sintética de Superadministrador para prueba','synthetic-request-superadmin-001');
  UPDATE synthetic_results SET superadmin_change_id=v_id;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"platform_role":"superadmin"}}',false);
SELECT public.platform_approve_superadmin_change(superadmin_change_id,'synthetic-request-superadmin-approve-001')
FROM synthetic_results;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_id uuid; v_claim jsonb;
BEGIN
  SELECT superadmin_change_id INTO v_id FROM synthetic_results;
  v_claim:=public.platform_claim_superadmin_change(v_id,'synthetic-request-superadmin-claim-001');
  IF v_claim->>'action'<>'grant' THEN RAISE EXCEPTION 'unexpected privilege action'; END IF;
  UPDATE auth.users SET raw_app_meta_data='{"platform_role":"superadmin"}' WHERE id='00000000-0000-4000-8000-000000000004';
  PERFORM public.platform_finish_superadmin_change(v_id,true,null,'synthetic-request-superadmin-finish-001');
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.platform_superadmin_change_requests WHERE status='completed' AND executed_by='00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'superadmin change saga did not complete';
  END IF;
END $$;

-- Groq plans are persisted as review-only and need independent approval.
DO $$
DECLARE v_id uuid;
BEGIN
  v_id:=public.platform_create_ai_change_plan('Plan sintético para revisar CI y políticas',
    '{"provider":"groq","category":"github","summary":"Revisar CI","risk":"medium","steps":[{"system":"github","action":"run_ci","description":"Ejecutar CI","requiresApproval":true}],"requiresSecondApproval":true,"executionMode":"review_only"}'::jsonb);
  UPDATE synthetic_results SET ai_plan_id=v_id;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"platform_role":"superadmin"}}',false);
SELECT public.platform_approve_ai_change_plan(ai_plan_id,'synthetic-request-ai-approve-001') FROM synthetic_results;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.platform_ai_change_plans WHERE status='approved' AND provider='groq') THEN
    RAISE EXCEPTION 'Groq plan was not independently approved';
  END IF;
END $$;

-- The original requester cannot execute; the independent approver claims and finishes once.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT ai_plan_id INTO v_id FROM synthetic_results;
  BEGIN
    PERFORM public.platform_claim_ai_change_plan_execution(v_id);
    RAISE EXCEPTION 'expected original requester execution denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_id uuid; v_claim jsonb;
BEGIN
  SELECT ai_plan_id INTO v_id FROM synthetic_results;
  v_claim:=public.platform_claim_ai_change_plan_execution(v_id);
  IF v_claim->>'id' IS NULL OR v_claim->'plan'->>'provider'<>'groq' THEN
    RAISE EXCEPTION 'independent approver must claim the Groq plan';
  END IF;
  PERFORM public.platform_finish_ai_change_plan_execution(v_id,true,'{"completed":1,"actions":[{"system":"github","action":"run_ci","status":"dispatched"}]}'::jsonb,null);
  BEGIN
    PERFORM public.platform_claim_ai_change_plan_execution(v_id);
    RAISE EXCEPTION 'expected single execution/idempotency guard';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.platform_ai_change_plans WHERE status='executed' AND approved_by='00000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'approved plan execution saga did not finish';
  END IF;
END $$;

-- Audit rows are append-only.
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM private.platform_audit_events LIMIT 1;
  BEGIN
    UPDATE private.platform_audit_events SET reason='tampered' WHERE id=v_id;
    RAISE EXCEPTION 'expected audit update rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='expected audit update rejection' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM private.platform_audit_events WHERE id=v_id;
    RAISE EXCEPTION 'expected audit delete rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='expected audit delete rejection' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","app_metadata":{},"user_metadata":{"platform_role":"superadmin"}}',false);
DO $$ BEGIN
  PERFORM * FROM public.platform_list_institutions(10,null,null,null);
  RAISE EXCEPTION 'expected institutional admin/non-superadmin denial';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

SELECT 'PASS: synthetic Superadmin authorization, tenant isolation, idempotency, delegation, clone isolation, dual approval and append-only audit' AS result;
