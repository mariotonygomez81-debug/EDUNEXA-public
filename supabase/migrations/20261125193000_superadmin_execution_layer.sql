-- EDUNEXA Superadmin execution layer: configuration-only worker, delegated context and approved-plan saga.
-- Repository migration only. Never apply to hosted Supabase without separate explicit authorization.

alter table private.platform_clone_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_error_code text;

create index if not exists platform_clone_jobs_claim_idx
  on private.platform_clone_jobs(status, lease_expires_at, created_at);

alter table private.platform_clone_jobs
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz;
alter table private.platform_clone_jobs
  drop constraint if exists platform_clone_jobs_status_check;
alter table private.platform_clone_jobs
  add constraint platform_clone_jobs_status_check
  check (status in ('pending_approval','queued','running','completed','failed','cancelled'));

create table if not exists private.platform_institution_clone_config (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  config_key text not null check (config_key in (
    'branding','academic_calendar','grading_scales','timetable_templates',
    'notification_templates','module_settings'
  )),
  config_value jsonb not null check (jsonb_typeof(config_value) in ('object','array')),
  updated_at timestamptz not null default now(),
  primary key(institution_id, config_key)
);
alter table private.platform_institution_clone_config enable row level security;
revoke all on private.platform_institution_clone_config from public, anon, authenticated;

create or replace function private.platform_clone_json_is_safe(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
  v_text text;
begin
  if p_value is null then return false; end if;
  if pg_catalog.jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from pg_catalog.jsonb_each(p_value) loop
      if v_key ~* '(student|pupil|guardian|parent|user|person|email|phone|address|document|dni|grade_record|attendance_record|message|password|secret|token|credential|medical|birth)' then
        return false;
      end if;
      if not private.platform_clone_json_is_safe(v_child) then return false; end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value) = 'array' then
    for v_child in select value from pg_catalog.jsonb_array_elements(p_value) loop
      if not private.platform_clone_json_is_safe(v_child) then return false; end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
    if v_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}'
      or v_text ~* '(gh[pousr]_[A-Za-z0-9_]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|Bearer[[:space:]]+[A-Za-z0-9._-]{20,})'
      or v_text ~ '(^|[^0-9])[0-9]{7,12}([^0-9]|$)' then
      return false;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.platform_request_clone_idempotent(
  p_source_institution_id uuid, p_display_name text, p_legal_name text,
  p_slug text, p_reason text, p_request_id text, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := private.platform_idempotency_claim(v_actor, p_idempotency_key, 'platform.clone.request',
    jsonb_build_object('source',p_source_institution_id,'display_name',p_display_name,
      'legal_name',p_legal_name,'slug',p_slug,'reason',p_reason));
  if coalesce((v_claim->>'claimed')::boolean,false) is false then
    return v_claim->'result';
  end if;
  v_result := public.platform_request_clone(p_source_institution_id,p_display_name,p_legal_name,p_slug,p_reason,p_request_id);
  update private.platform_clone_jobs set status='pending_approval' where id=(v_result->>'job_id')::uuid;
  perform private.platform_audit_append('platform.clone.approval_required','clone_job',v_result->>'job_id',
    (v_result->>'target_institution_id')::uuid,p_reason,p_request_id,'started',
    jsonb_build_object('source_institution_id',p_source_institution_id,'requires_second_approval',true));
  v_result := pg_catalog.jsonb_set(v_result,'{status}','"pending_second_approval"'::jsonb);
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

create or replace function public.platform_request_delegation_idempotent(
  p_institution_id uuid,p_reason text,p_expires_at timestamptz,
  p_request_id text,p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_claim jsonb;
  v_id uuid;
  v_result jsonb;
begin
  v_claim := private.platform_idempotency_claim(v_actor,p_idempotency_key,'platform.delegation.request',
    jsonb_build_object('institution_id',p_institution_id,'reason',p_reason,'expires_at',p_expires_at));
  if coalesce((v_claim->>'claimed')::boolean,false) is false then
    return v_claim->'result';
  end if;
  v_id := public.platform_request_delegation(p_institution_id,p_reason,p_expires_at,p_request_id);
  v_result := jsonb_build_object('delegation_id',v_id,'status','pending_second_approval');
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

create or replace function private.platform_require_worker()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception using errcode='42501', message='platform_worker_required';
  end if;
end;
$$;

create or replace function public.platform_approve_clone_job(p_job_id uuid,p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_job private.platform_clone_jobs%rowtype;
begin
  select * into v_job from private.platform_clone_jobs where id=p_job_id for update;
  if not found or v_job.status<>'pending_approval' then
    raise exception using errcode='P0002', message='pending_clone_approval_not_found';
  end if;
  if v_job.requested_by=v_actor then
    raise exception using errcode='42501', message='clone_requires_independent_approval';
  end if;
  update private.platform_clone_jobs set status='queued',approved_by=v_actor,approved_at=pg_catalog.now()
  where id=p_job_id;
  perform private.platform_audit_append('platform.clone.approve','clone_job',p_job_id::text,
    v_job.target_institution_id,'Aprobación independiente de clonación configuration-only',p_request_id,'success',
    jsonb_build_object('source_institution_id',v_job.source_institution_id,'target_institution_id',v_job.target_institution_id,
      'copy_mode','configuration_only','personal_data_copied',false));
  return jsonb_build_object('id',p_job_id,'status','queued','approved_by',v_actor,'copy_mode','configuration_only');
end;
$$;

create or replace function public.platform_claim_clone_job(p_lease_seconds integer default 180)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.platform_clone_jobs%rowtype;
begin
  perform private.platform_require_worker();
  if p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception using errcode='22023', message='invalid_worker_lease';
  end if;
  with exhausted as (
    update private.platform_clone_jobs
      set status='failed',completed_at=pg_catalog.now(),lease_expires_at=null,
          last_error_code='lease_expired_max_attempts'
    where status='running' and lease_expires_at < pg_catalog.now() and attempt_count >= 3
    returning id,requested_by,target_institution_id,attempt_count
  )
  insert into private.platform_audit_events(
    actor_user_id,action,target_type,target_id,institution_id,reason,request_id,outcome,metadata_redacted
  )
  select requested_by,'platform.clone.worker.exhausted','clone_job',id::text,target_institution_id,
    'Trabajo agotado luego de vencer sus leases','clone-worker-exhausted-'||id::text||'-'||attempt_count,
    'failed',jsonb_build_object('attempt_count',attempt_count)
  from exhausted;

  select * into v_job
  from private.platform_clone_jobs
  where (status='queued' and approved_by is not null or (status='running' and lease_expires_at < pg_catalog.now()))
    and attempt_count < 3
  order by created_at, id
  limit 1
  for update skip locked;
  if not found then return null; end if;

  update private.platform_clone_jobs
  set status='running', attempt_count=attempt_count+1,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>p_lease_seconds),
      last_error_code=null
  where id=v_job.id
  returning * into v_job;

  insert into private.platform_audit_events(
    actor_user_id,action,target_type,target_id,institution_id,reason,request_id,outcome,metadata_redacted
  ) values (
    v_job.requested_by,'platform.clone.worker.start','clone_job',v_job.id::text,
    v_job.target_institution_id,'Ejecución del trabajador configuration-only',
    'clone-worker-start-'||v_job.id::text,'started',
    jsonb_build_object('attempt',v_job.attempt_count,'copy_mode','configuration_only')
  );
  return jsonb_build_object('id',v_job.id,'source_institution_id',v_job.source_institution_id,
    'target_institution_id',v_job.target_institution_id,'attempt_count',v_job.attempt_count,
    'copy_mode',v_job.copy_mode);
end;
$$;

create or replace function public.platform_finish_clone_job(
  p_job_id uuid, p_success boolean, p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.platform_clone_jobs%rowtype;
  v_copied integer := 0;
  v_status text;
begin
  perform private.platform_require_worker();
  select * into v_job from private.platform_clone_jobs where id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.approved_by is null then
    raise exception using errcode='P0002', message='running_clone_job_not_found';
  end if;

  if p_success then
    if v_job.copy_mode <> 'configuration_only' then
      raise exception using errcode='23514', message='clone_copy_mode_not_allowed';
    end if;
    if exists (
      select 1 from private.platform_institution_clone_config c
      where c.institution_id=v_job.source_institution_id
        and not private.platform_clone_json_is_safe(c.config_value)
    ) then
      raise exception using errcode='23514', message='unsafe_clone_configuration_rejected';
    end if;
    insert into private.platform_institution_clone_config(institution_id,config_key,config_value)
    select v_job.target_institution_id, c.config_key, c.config_value
    from private.platform_institution_clone_config c
    where c.institution_id=v_job.source_institution_id
      and c.config_key in ('branding','academic_calendar','grading_scales','timetable_templates','notification_templates','module_settings')
      and private.platform_clone_json_is_safe(c.config_value)
    on conflict(institution_id,config_key) do update
      set config_value=excluded.config_value, updated_at=pg_catalog.now();
    get diagnostics v_copied = row_count;

    update private.platform_clone_jobs
      set status='completed',completed_at=pg_catalog.now(),lease_expires_at=null,last_error_code=null,
          result_summary=jsonb_build_object('copied_configuration_categories',v_copied,'personal_data_copied',false)
    where id=p_job_id;
    v_status := 'completed';
  else
    v_status := case when v_job.attempt_count >= 3 then 'failed' else 'queued' end;
    update private.platform_clone_jobs
      set status=v_status,lease_expires_at=null,last_error_code=coalesce(p_failure_code,'worker_failed'),
          completed_at=case when v_status='failed' then pg_catalog.now() else null end
    where id=p_job_id;
  end if;

  insert into private.platform_audit_events(
    actor_user_id,action,target_type,target_id,institution_id,reason,request_id,outcome,metadata_redacted
  ) values (
    v_job.requested_by,'platform.clone.worker.finish','clone_job',v_job.id::text,
    v_job.target_institution_id,'Resultado del trabajador configuration-only',
    'clone-worker-finish-'||v_job.id::text||'-'||v_job.attempt_count,
    case when p_success then 'success' when v_status='failed' then 'failed' else 'started' end,
    jsonb_build_object('status',v_status,'copied_configuration_categories',v_copied,
      'personal_data_copied',false,'failure_code',case when p_success then null else coalesce(p_failure_code,'worker_failed') end)
  );
  return jsonb_build_object('id',p_job_id,'status',v_status,
    'copied_configuration_categories',v_copied,'personal_data_copied',false);
end;
$$;

create or replace function public.platform_resolve_delegated_context(p_institution_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_grant private.platform_delegations%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501', message='platform_superadmin_required'; end if;
  select u.raw_app_meta_data->>'platform_role' into v_role from auth.users u where u.id=v_actor;
  if v_role is distinct from 'superadmin' then
    raise exception using errcode='42501', message='platform_superadmin_required';
  end if;
  select * into v_grant
  from private.platform_delegations d
  where d.institution_id=p_institution_id and d.requested_by=v_actor
    and d.status='active' and d.approved_by is not null and d.approved_by<>v_actor
    and d.expires_at>pg_catalog.now()
  order by d.approved_at desc
  limit 1;
  if not found then return null; end if;

  perform private.platform_audit_append('platform.delegation.context.resolve','delegation',v_grant.id::text,
    p_institution_id,'Acceso de soporte delegado de solo lectura',
    'delegation-context-'||v_grant.id::text,'success',
    jsonb_build_object('expires_at',v_grant.expires_at,'capabilities',jsonb_build_array('institution.read','audit.read')));
  return jsonb_build_object('delegation_id',v_grant.id,'institution_id',p_institution_id,
    'mode','delegated_support_read_only','expires_at',v_grant.expires_at,
    'capabilities',jsonb_build_array('institution.read','audit.read'));
end;
$$;

alter table private.platform_ai_change_plans
  drop constraint if exists platform_ai_change_plans_status_check;
alter table private.platform_ai_change_plans
  add constraint platform_ai_change_plans_status_check
  check (status in ('pending','approved','executing','executed','failed','rejected'));

create or replace function public.platform_claim_ai_change_plan_execution(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_plan private.platform_ai_change_plans%rowtype;
begin
  select * into v_plan from private.platform_ai_change_plans where id=p_plan_id for update;
  if not found or v_plan.status<>'approved' then
    raise exception using errcode='P0002', message='approved_ai_plan_not_found';
  end if;
  if v_plan.requested_by=v_actor or v_plan.approved_by is distinct from v_actor then
    raise exception using errcode='42501', message='ai_plan_execution_requires_independent_approver';
  end if;
  if v_plan.plan->>'provider'<>'groq' or v_plan.plan->>'executionMode'<>'review_only'
    or pg_catalog.jsonb_typeof(v_plan.plan->'steps')<>'array'
    or pg_catalog.jsonb_array_length(v_plan.plan->'steps') not between 1 and 10 then
    raise exception using errcode='22023', message='invalid_approved_ai_plan';
  end if;
  update private.platform_ai_change_plans set status='executing' where id=p_plan_id;
  perform private.platform_audit_append('platform.copilot.execute.start','ai_change_plan',p_plan_id::text,null,
    'Inicio de ejecución de plan aprobado por segundo Superadministrador',
    'copilot-execute-start-'||p_plan_id::text,'started',
    jsonb_build_object('provider','groq','step_count',pg_catalog.jsonb_array_length(v_plan.plan->'steps')));
  return jsonb_build_object('id',v_plan.id,'plan',v_plan.plan,'requested_by',v_plan.requested_by,
    'approved_by',v_plan.approved_by);
end;
$$;

create or replace function public.platform_finish_ai_change_plan_execution(
  p_plan_id uuid,p_success boolean,p_result jsonb,p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_plan private.platform_ai_change_plans%rowtype;
  v_status text := case when p_success then 'executed' else 'failed' end;
begin
  select * into v_plan from private.platform_ai_change_plans where id=p_plan_id for update;
  if not found or v_plan.status<>'executing' or v_plan.approved_by is distinct from v_actor then
    raise exception using errcode='P0002', message='executing_ai_plan_not_found';
  end if;
  update private.platform_ai_change_plans
    set status=v_status,executed_at=pg_catalog.now(),
        execution_summary=coalesce(p_result,'{}'::jsonb)
  where id=p_plan_id;
  perform private.platform_audit_append('platform.copilot.execute.finish','ai_change_plan',p_plan_id::text,null,
    'Resultado de ejecución del plan aprobado',
    'copilot-execute-finish-'||p_plan_id::text,
    case when p_success then 'success' else 'failed' end,
    jsonb_build_object('provider','groq','status',v_status,'failure_code',case when p_success then null else coalesce(p_failure_code,'execution_failed') end));
  return jsonb_build_object('id',p_plan_id,'status',v_status);
end;
$$;

revoke all on function private.platform_clone_json_is_safe(jsonb) from public, anon, authenticated;
revoke all on function private.platform_require_worker() from public, anon, authenticated;
revoke all on function public.platform_request_clone_idempotent(uuid,text,text,text,text,text,text) from public, anon;
revoke all on function public.platform_approve_clone_job(uuid,text) from public, anon;
revoke all on function public.platform_request_delegation_idempotent(uuid,text,timestamptz,text,text) from public, anon;
revoke all on function public.platform_claim_clone_job(integer) from public, anon, authenticated;
revoke all on function public.platform_finish_clone_job(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.platform_resolve_delegated_context(uuid) from public, anon;
revoke all on function public.platform_claim_ai_change_plan_execution(uuid) from public, anon;
revoke all on function public.platform_finish_ai_change_plan_execution(uuid,boolean,jsonb,text) from public, anon;

grant execute on function public.platform_request_clone_idempotent(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.platform_approve_clone_job(uuid,text) to authenticated;
grant execute on function public.platform_request_delegation_idempotent(uuid,text,timestamptz,text,text) to authenticated;
grant usage on schema private to service_role;
grant execute on function private.platform_require_worker() to service_role;
grant execute on function public.platform_claim_clone_job(integer) to service_role;
grant execute on function public.platform_finish_clone_job(uuid,boolean,text) to service_role;
grant execute on function public.platform_resolve_delegated_context(uuid) to authenticated;
grant execute on function public.platform_claim_ai_change_plan_execution(uuid) to authenticated;
grant execute on function public.platform_finish_ai_change_plan_execution(uuid,boolean,jsonb,text) to authenticated;

create or replace function public.platform_resolve_delegated_context_by_slug(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_row record;
begin
  if v_actor is null then raise exception using errcode='42501', message='platform_superadmin_required'; end if;
  select u.raw_app_meta_data->>'platform_role' into v_role from auth.users u where u.id=v_actor;
  if v_role is distinct from 'superadmin' then
    raise exception using errcode='42501', message='platform_superadmin_required';
  end if;
  select d.id as delegation_id,d.institution_id,d.expires_at,
         i.display_name,i.slug
    into v_row
  from private.platform_delegations d
  join public.institutions i on i.id=d.institution_id
  where i.slug=p_slug and i.status='active'
    and d.requested_by=v_actor and d.status='active'
    and d.approved_by is not null and d.approved_by<>v_actor
    and d.expires_at>pg_catalog.now()
  order by d.approved_at desc
  limit 1;
  if not found then return null; end if;

  perform private.platform_audit_append('platform.delegation.context.resolve','delegation',v_row.delegation_id::text,
    v_row.institution_id,'Acceso de soporte delegado de solo lectura',
    'delegation-slug-context-'||v_row.delegation_id::text,'success',
    jsonb_build_object('expires_at',v_row.expires_at,'capabilities',jsonb_build_array('institution.read','audit.read')));
  return jsonb_build_object(
    'delegation_id',v_row.delegation_id,'institution_id',v_row.institution_id,
    'mode','delegated_support_read_only','expires_at',v_row.expires_at,
    'institution',jsonb_build_object('id',v_row.institution_id,'display_name',v_row.display_name,'slug',v_row.slug),
    'capabilities',jsonb_build_array('institution.read','audit.read')
  );
end;
$$;

revoke all on function public.platform_resolve_delegated_context_by_slug(text) from public, anon;
grant execute on function public.platform_resolve_delegated_context_by_slug(text) to authenticated;

comment on table private.platform_institution_clone_config is 'Strict allowlist of non-personal institutional configuration copied by the configuration-only clone worker.';
comment on function public.platform_resolve_delegated_context(uuid) is 'Resolves an approved, unexpired, requester-bound read-only support context. It never creates an institutional membership or impersonates a user.';
comment on function public.platform_claim_clone_job(integer) is 'Service-role-only SKIP LOCKED worker claim with expiring lease and three-attempt limit.';
