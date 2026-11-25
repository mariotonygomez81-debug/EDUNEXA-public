\set ON_ERROR_STOP on
CREATE TEMP TABLE synthetic_results (
  institution_id uuid,
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
DO $
DECLARE v_id uuid; v_super_count integer; v_admin_count integer;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  SELECT count(*) INTO v_super_count FROM public.platform_list_superadmins();
  IF v_super_count<>3 THEN RAISE EXCEPTION 'global Superadministrator registry must show only trusted superadmins'; END IF;
  SELECT count(*) INTO v_admin_count FROM public.platform_list_institution_admins(v_id);
  IF v_admin_count<>0 THEN RAISE EXCEPTION 'new institution must not have administrators'; END IF;
END $;

-- Activate with optimistic concurrency and assign two administrators.
DO $$
DECLARE v_id uuid; v_version timestamptz;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  SELECT updated_at INTO v_version FROM public.institutions WHERE id=v_id;
  PERFORM public.platform_set_institution_status(v_id,'active',v_version,
    'Activación sintética luego de verificar la ficha','synthetic-request-status-001','synthetic-status-key-0001');
  PERFORM public.platform_assign_institution_admin(v_id,'00000000-0000-4000-8000-000000000004',
    'Asignación sintética de administrador institucional','synthetic-request-admin-001','synthetic-admin-key-00001');
  PERFORM public.platform_assign_institution_admin(v_id,'00000000-0000-4000-8000-000000000005',
    'Asignación sintética de segundo administrador','synthetic-request-admin-002','synthetic-admin-key-00002');
END $$;

-- Administrator list is scoped to one institution and reflects active and inactive memberships.
DO $
DECLARE v_id uuid; v_count integer;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  SELECT count(*) INTO v_count FROM public.platform_list_institution_admins(v_id);
  IF v_count<>2 THEN RAISE EXCEPTION 'institution administrator registry must return both assigned administrators'; END IF;
END $;

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
DECLARE v_id uuid; v_delegation uuid; v_self uuid;
BEGIN
  SELECT institution_id INTO v_id FROM synthetic_results;
  v_delegation:=public.platform_request_delegation(v_id,'Asistencia técnica sintética solicitada',
    now()+interval '15 minutes','synthetic-request-delegation-001');
  INSERT INTO synthetic_results(delegation_id) VALUES(v_delegation);
  v_self:=public.platform_request_delegation(v_id,'Segunda solicitud sintética para prueba',
    now()+interval '10 minutes','synthetic-request-delegation-002');
  INSERT INTO synthetic_results(self_delegation_id) VALUES(v_self);
  BEGIN
    PERFORM public.platform_request_delegation(v_id,'Prueba de vencimiento fuera del máximo',
      now()+interval '1 hour','synthetic-request-delegation-003');
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

-- An active support delegation can be revoked and the action is audited.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"platform_role":"superadmin"}}',false);
SELECT public.platform_revoke_delegation(delegation_id,'Cierre de asistencia sintética completada','synthetic-request-delegation-revoke')
FROM synthetic_results WHERE delegation_id IS NOT NULL;
DO $ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.platform_delegations WHERE status='revoked') THEN
    RAISE EXCEPTION 'delegation was not revoked';
  END IF;
END $;

-- The requester cannot approve their own delegation.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","app_metadata":{"platform_role":"superadmin"}}',false);
DO $$
DECLARE v_self uuid;
BEGIN
  SELECT self_delegation_id INTO v_self FROM synthetic_results;
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
  v_result:=public.platform_request_clone(v_source,'Colegio Clonado Sintético','Colegio Clonado Sintético S.A.',
    'colegio-clonado-sintetico','Clonación sintética sin expedientes ni datos personales','synthetic-request-clone-001');
  UPDATE synthetic_results SET clone_job_id=(v_result->>'job_id')::uuid,clone_target_id=(v_result->>'target_institution_id')::uuid;
END $$;
DO $$
DECLARE v_job private.platform_clone_jobs%rowtype;
BEGIN
  SELECT * INTO v_job FROM private.platform_clone_jobs WHERE id=(SELECT clone_job_id FROM synthetic_results);
  IF v_job.copy_mode<>'configuration_only' OR v_job.status<>'queued' THEN RAISE EXCEPTION 'clone job is not safely queued'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.institutions WHERE id=v_job.target_institution_id AND status='pending') THEN
    RAISE EXCEPTION 'clone target must remain pending';
  END IF;
END $$;

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
