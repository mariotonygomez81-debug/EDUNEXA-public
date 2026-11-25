-- EDUNEXA: synchronize real institutional configuration into the isolated clone registry
-- and scope delegated support to explicitly approved, read-only modules.
-- Repository-only migration: do not apply to hosted Supabase without explicit authorization.

alter table private.platform_delegations
  add column if not exists module_scope text[] not null default '{}';

-- Existing unscoped grants are revoked rather than silently widened to every module.
with revoked as (
  update private.platform_delegations
    set status='revoked',revoked_at=coalesce(revoked_at,pg_catalog.now())
  where status in ('pending','active') and cardinality(module_scope)=0
  returning id,institution_id,requested_by
)
insert into private.platform_audit_events(
  actor_user_id,action,target_type,target_id,institution_id,reason,request_id,outcome,metadata_redacted
)
select requested_by,'platform.delegation.legacy_scope_revoked','delegation',id::text,institution_id,
  'Acceso anterior revocado al exigir alcance explícito por módulo',
  'delegation-legacy-scope-revoked-'||id::text,'success',
  jsonb_build_object('reason','legacy_grant_had_no_module_scope')
from revoked;

alter table private.platform_delegations
  drop constraint if exists platform_delegations_module_scope_check;
alter table private.platform_delegations
  add constraint platform_delegations_module_scope_check
  check (
    (status not in ('pending','active') or cardinality(module_scope) between 1 and 7)
    and module_scope <@ array[
      'docentes','preceptor','alumnos','tutor','directivos','administrativos','administrador'
    ]::text[]
  );

alter table private.platform_institution_clone_config
  drop constraint if exists platform_institution_clone_config_config_key_check;
alter table private.platform_institution_clone_config
  add constraint platform_institution_clone_config_config_key_check
  check (config_key in (
    'branding','academic_calendar','grading_scales','academic_structure',
    'timetable_templates','notification_templates','module_settings'
  ));

create or replace function private.platform_refresh_institution_clone_config(p_institution_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calendar jsonb;
  v_scales jsonb;
  v_structure jsonb;
begin
  if p_institution_id is null then return; end if;

  select jsonb_build_object(
    'academic_years', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', ay.name, 'starts_on', ay.starts_on, 'ends_on', ay.ends_on,
        'status', case when ay.status='active' then 'planned' else ay.status end
      ) order by ay.starts_on)
      from public.academic_years ay where ay.institution_id=p_institution_id
    ), '[]'::jsonb),
    'grading_periods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'academic_year_name', ay.name, 'name', gp.name, 'starts_on', gp.starts_on,
        'ends_on', gp.ends_on, 'sort_order', gp.sort_order
      ) order by ay.starts_on, gp.sort_order)
      from public.grading_periods gp
      join public.academic_years ay on ay.id=gp.academic_year_id and ay.institution_id=gp.institution_id
      where gp.institution_id=p_institution_id
    ), '[]'::jsonb)
  ) into v_calendar;

  select jsonb_build_object(
    'scales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', gs.name, 'description', gs.description, 'display_mode', gs.display_mode,
        'minimum_value', gs.minimum_value, 'maximum_value', gs.maximum_value,
        'passing_value', gs.passing_value,
        'levels', coalesce((
          select jsonb_agg(jsonb_build_object(
            'minimum_percentage', gl.minimum_percentage, 'maximum_percentage', gl.maximum_percentage,
            'label', gl.label, 'grade_value', gl.grade_value, 'is_passing', gl.is_passing,
            'sort_order', gl.sort_order
          ) order by gl.sort_order)
          from public.grading_scale_levels gl
          where gl.grading_scale_id=gs.id and gl.institution_id=gs.institution_id
        ), '[]'::jsonb)
      ) order by gs.name)
      from public.grading_scales gs where gs.institution_id=p_institution_id
    ), '[]'::jsonb)
  ) into v_scales;

  select jsonb_build_object(
    'education_levels', coalesce((
      select jsonb_agg(jsonb_build_object('name',el.name,'code',el.code,'sort_order',el.sort_order) order by el.sort_order,el.name)
      from public.education_levels el where el.institution_id=p_institution_id
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'level_name',el.name,'name',c.name,'grade_number',c.grade_number,'shift',c.shift
      ) order by el.sort_order,c.grade_number,c.name)
      from public.courses c
      join public.education_levels el on el.id=c.level_id and el.institution_id=c.institution_id
      where c.institution_id=p_institution_id
    ), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('name',s.name,'code',s.code) order by s.name)
      from public.subjects s where s.institution_id=p_institution_id
    ), '[]'::jsonb),
    'course_subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'course_name',c.name,'subject_name',s.name,'weekly_hours',cs.weekly_hours
      ) order by c.name,s.name)
      from public.course_subjects cs
      join public.courses c on c.id=cs.course_id and c.institution_id=cs.institution_id
      join public.subjects s on s.id=cs.subject_id and s.institution_id=cs.institution_id
      where cs.institution_id=p_institution_id
    ), '[]'::jsonb)
  ) into v_structure;

  if not private.platform_clone_json_is_safe(v_calendar)
    or not private.platform_clone_json_is_safe(v_scales)
    or not private.platform_clone_json_is_safe(v_structure) then
    raise exception using errcode='23514', message='unsafe_institution_configuration_snapshot';
  end if;

  insert into private.platform_institution_clone_config(institution_id,config_key,config_value)
  values
    (p_institution_id,'academic_calendar',v_calendar),
    (p_institution_id,'grading_scales',v_scales),
    (p_institution_id,'academic_structure',v_structure)
  on conflict(institution_id,config_key) do update
    set config_value=excluded.config_value,updated_at=pg_catalog.now();
end;
$$;

create or replace function private.platform_refresh_institution_clone_config_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_institution_id uuid;
begin
  if tg_op='DELETE' then
    perform private.platform_refresh_institution_clone_config(old.institution_id);
    return old;
  elsif tg_op='UPDATE' and old.institution_id is distinct from new.institution_id then
    perform private.platform_refresh_institution_clone_config(old.institution_id);
    perform private.platform_refresh_institution_clone_config(new.institution_id);
    return new;
  end if;
  v_institution_id:=new.institution_id;
  perform private.platform_refresh_institution_clone_config(v_institution_id);
  return new;
end;
$;

drop trigger if exists platform_clone_snapshot_academic_years on public.academic_years;
create trigger platform_clone_snapshot_academic_years
after insert or update or delete on public.academic_years
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_grading_periods on public.grading_periods;
create trigger platform_clone_snapshot_grading_periods
after insert or update or delete on public.grading_periods
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_grading_scales on public.grading_scales;
create trigger platform_clone_snapshot_grading_scales
after insert or update or delete on public.grading_scales
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_grading_scale_levels on public.grading_scale_levels;
create trigger platform_clone_snapshot_grading_scale_levels
after insert or update or delete on public.grading_scale_levels
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_education_levels on public.education_levels;
create trigger platform_clone_snapshot_education_levels
after insert or update or delete on public.education_levels
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_courses on public.courses;
create trigger platform_clone_snapshot_courses
after insert or update or delete on public.courses
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_subjects on public.subjects;
create trigger platform_clone_snapshot_subjects
after insert or update or delete on public.subjects
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_course_subjects on public.course_subjects;
create trigger platform_clone_snapshot_course_subjects
after insert or update or delete on public.course_subjects
for each row execute function private.platform_refresh_institution_clone_config_trigger();

-- Populate snapshots for institutions that already have configuration.
do $$
declare v_id uuid;
begin
  for v_id in select id from public.institutions loop
    perform private.platform_refresh_institution_clone_config(v_id);
  end loop;
end;
$$;

create or replace function public.platform_request_delegation_scoped_idempotent(
  p_institution_id uuid,p_reason text,p_expires_at timestamptz,p_module_scope text[],
  p_request_id text,p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=private.require_platform_superadmin();
  v_claim jsonb;
  v_id uuid;
  v_scope text[];
  v_result jsonb;
begin
  select coalesce(array_agg(distinct x order by x),'{}'::text[]) into v_scope
  from unnest(coalesce(p_module_scope,'{}'::text[])) x
  where x in ('docentes','preceptor','alumnos','tutor','directivos','administrativos','administrador');
  if cardinality(v_scope) not between 1 and 7
    or cardinality(v_scope)<>cardinality(p_module_scope) then
    raise exception using errcode='22023',message='invalid_delegated_module_scope';
  end if;
  v_claim:=private.platform_idempotency_claim(v_actor,p_idempotency_key,'platform.delegation.scoped.request',
    jsonb_build_object('institution_id',p_institution_id,'reason',p_reason,'expires_at',p_expires_at,'module_scope',v_scope));
  if coalesce((v_claim->>'claimed')::boolean,false) is false then return v_claim->'result'; end if;
  v_id:=public.platform_request_delegation(p_institution_id,p_reason,p_expires_at,p_request_id);
  update private.platform_delegations set module_scope=v_scope where id=v_id;
  perform private.platform_audit_append('platform.delegation.scope.assign','delegation',v_id::text,p_institution_id,
    p_reason,p_request_id,'success',jsonb_build_object('module_scope',v_scope,'read_only',true));
  v_result:=jsonb_build_object('delegation_id',v_id,'status','pending_second_approval','module_scope',v_scope);
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

create or replace function public.platform_resolve_delegated_context(p_institution_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_grant private.platform_delegations%rowtype;
begin
  if v_actor is null or not exists(
    select 1 from auth.users u where u.id=v_actor and u.raw_app_meta_data->>'platform_role'='superadmin'
  ) then raise exception using errcode='42501',message='platform_superadmin_required'; end if;
  select * into v_grant from private.platform_delegations d
  where d.institution_id=p_institution_id and d.requested_by=v_actor
    and d.status='active' and d.approved_by is not null and d.approved_by<>v_actor
    and d.expires_at>pg_catalog.now() and cardinality(d.module_scope)>0
  order by d.approved_at desc limit 1;
  if not found then return null; end if;
  perform private.platform_audit_append('platform.delegation.context.resolve','delegation',v_grant.id::text,
    p_institution_id,'Acceso delegado por módulos de solo lectura','delegation-module-context-'||v_grant.id::text,
    'success',jsonb_build_object('expires_at',v_grant.expires_at,'module_scope',v_grant.module_scope));
  return jsonb_build_object('delegation_id',v_grant.id,'institution_id',p_institution_id,
    'mode','delegated_support_read_only','expires_at',v_grant.expires_at,'module_scope',v_grant.module_scope);
end;
$$;

create or replace function public.platform_resolve_delegated_context_by_slug(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_row record;
begin
  if v_actor is null or not exists(
    select 1 from auth.users u where u.id=v_actor and u.raw_app_meta_data->>'platform_role'='superadmin'
  ) then raise exception using errcode='42501',message='platform_superadmin_required'; end if;
  select d.id as delegation_id,d.institution_id,d.expires_at,d.module_scope,i.display_name,i.slug
    into v_row
  from private.platform_delegations d
  join public.institutions i on i.id=d.institution_id
  where i.slug=p_slug and i.status='active' and d.requested_by=v_actor
    and d.status='active' and d.approved_by is not null and d.approved_by<>v_actor
    and d.expires_at>pg_catalog.now() and cardinality(d.module_scope)>0
  order by d.approved_at desc limit 1;
  if not found then return null; end if;
  perform private.platform_audit_append('platform.delegation.context.resolve','delegation',v_row.delegation_id::text,
    v_row.institution_id,'Acceso delegado por módulos de solo lectura','delegation-slug-module-context-'||v_row.delegation_id::text,
    'success',jsonb_build_object('expires_at',v_row.expires_at,'module_scope',v_row.module_scope));
  return jsonb_build_object('delegation_id',v_row.delegation_id,'institution_id',v_row.institution_id,
    'mode','delegated_support_read_only','expires_at',v_row.expires_at,'module_scope',v_row.module_scope,
    'institution',jsonb_build_object('id',v_row.institution_id,'display_name',v_row.display_name,'slug',v_row.slug));
end;
$$;

create or replace function public.platform_read_delegated_module(p_delegation_id uuid,p_module_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_grant private.platform_delegations%rowtype;
  v_keys text[];
  v_result jsonb;
begin
  if v_actor is null or not exists(
    select 1 from auth.users u where u.id=v_actor and u.raw_app_meta_data->>'platform_role'='superadmin'
  ) then raise exception using errcode='42501',message='platform_superadmin_required'; end if;
  select * into v_grant from private.platform_delegations d
  where d.id=p_delegation_id and d.requested_by=v_actor and d.status='active'
    and d.approved_by is not null and d.approved_by<>v_actor and d.expires_at>pg_catalog.now()
  for share;
  if not found or not exists(
    select 1 from public.institutions i where i.id=v_grant.institution_id and i.status='active'
  ) then raise exception using errcode='42501',message='delegation_context_expired_or_revoked'; end if;
  if not (p_module_key=any(v_grant.module_scope)) then
    raise exception using errcode='42501',message='delegated_module_not_authorized';
  end if;
  v_keys:=case p_module_key
    when 'docentes' then array['academic_structure']
    when 'preceptor' then array['academic_structure','academic_calendar']
    when 'alumnos' then array['academic_calendar','grading_scales']
    when 'tutor' then array['academic_calendar']
    when 'directivos' then array['academic_calendar','grading_scales','academic_structure']
    when 'administrativos' then array['academic_structure']
    when 'administrador' then array['academic_calendar','grading_scales','academic_structure','branding','module_settings']
    else null end;
  if v_keys is null then raise exception using errcode='22023',message='invalid_delegated_module'; end if;
  select coalesce(jsonb_object_agg(c.config_key,c.config_value),'{}'::jsonb)
    into v_result
  from private.platform_institution_clone_config c
  where c.institution_id=v_grant.institution_id and c.config_key=any(v_keys);
  perform private.platform_audit_append('platform.delegation.module.read','delegation',v_grant.id::text,
    v_grant.institution_id,'Consulta de configuración institucional no personal',
    'delegation-module-read-'||v_grant.id::text||'-'||p_module_key||'-'||pg_catalog.txid_current()::text,
    'success',jsonb_build_object('module',p_module_key,'config_categories',v_keys,'read_only',true));
  return jsonb_build_object('module',p_module_key,'read_only',true,'configuration',v_result,
    'expires_at',v_grant.expires_at);
end;
$$;

create or replace function public.platform_list_delegations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'institution_id',d.institution_id,'institution_name',i.display_name,'institution_slug',i.slug,
    'requested_by',d.requested_by,'approved_by',d.approved_by,'reason',d.reason,'status',
    case when d.status='active' and d.expires_at<=pg_catalog.now() then 'expired' else d.status end,
    'expires_at',d.expires_at,'module_scope',d.module_scope,'created_at',d.created_at
  ) order by d.created_at desc),'[]'::jsonb)
  into v_result from private.platform_delegations d
  join public.institutions i on i.id=d.institution_id;
  perform private.platform_audit_append('platform.delegations.list','delegations',null,null,
    'Consulta del registro de accesos delegados','delegations-list-'||pg_catalog.txid_current()::text,'success',
    jsonb_build_object('count',jsonb_array_length(v_result)));
  return v_result;
end;
$$;

create or replace function public.platform_list_ai_change_plans()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare v_actor uuid:=private.require_platform_superadmin(); v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'provider',p.provider,'instruction',p.instruction_redacted,'plan',p.plan,
    'status',p.status,'requested_by',p.requested_by,'approved_by',p.approved_by,
    'created_at',p.created_at,'approved_at',p.approved_at,'executed_at',p.executed_at
  ) order by p.created_at desc),'[]'::jsonb)
  into v_result from (
    select * from private.platform_ai_change_plans order by created_at desc limit 30
  ) p;
  perform private.platform_audit_append('platform.ai_plans.list','ai_change_plans',null,null,
    'Consulta de planes del Copiloto EDUNEXA','ai-plans-list-'||pg_catalog.txid_current()::text,'success',
    jsonb_build_object('count',jsonb_array_length(v_result),'provider','groq'));
  return v_result;
end;
$;

create or replace function public.platform_list_clone_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'source_institution_id',j.source_institution_id,'source_name',src.display_name,
    'target_institution_id',j.target_institution_id,'target_name',dst.display_name,
    'requested_by',j.requested_by,'approved_by',j.approved_by,'status',j.status,
    'copy_mode',j.copy_mode,'attempt_count',j.attempt_count,'reason',j.reason,'created_at',j.created_at,
    'result_summary',j.result_summary
  ) order by j.created_at desc),'[]'::jsonb)
  into v_result from private.platform_clone_jobs j
  join public.institutions src on src.id=j.source_institution_id
  join public.institutions dst on dst.id=j.target_institution_id;
  perform private.platform_audit_append('platform.clone_jobs.list','clone_jobs',null,null,
    'Consulta de trabajos de clonación','clone-jobs-list-'||pg_catalog.txid_current()::text,'success',
    jsonb_build_object('count',jsonb_array_length(v_result)));
  return v_result;
end;
$$;

revoke all on function private.platform_refresh_institution_clone_config(uuid) from public,anon,authenticated;
revoke all on function private.platform_refresh_institution_clone_config_trigger() from public,anon,authenticated;
revoke all on function public.platform_request_delegation_scoped_idempotent(uuid,text,timestamptz,text[],text,text) from public,anon;
revoke all on function public.platform_request_delegation(uuid,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.platform_request_delegation_idempotent(uuid,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.platform_resolve_delegated_context(uuid) from public,anon;
revoke all on function public.platform_resolve_delegated_context_by_slug(text) from public,anon;
revoke all on function public.platform_read_delegated_module(uuid,text) from public,anon;
revoke all on function public.platform_list_delegations() from public,anon;
revoke all on function public.platform_list_clone_jobs() from public,anon;
revoke all on function public.platform_list_ai_change_plans() from public,anon;
grant execute on function public.platform_request_delegation_scoped_idempotent(uuid,text,timestamptz,text[],text,text) to authenticated;
grant execute on function public.platform_resolve_delegated_context(uuid) to authenticated;
grant execute on function public.platform_resolve_delegated_context_by_slug(text) to authenticated;
grant execute on function public.platform_read_delegated_module(uuid,text) to authenticated;
grant execute on function public.platform_list_delegations() to authenticated;
grant execute on function public.platform_list_clone_jobs() to authenticated;
grant execute on function public.platform_list_ai_change_plans() to authenticated;

comment on function public.platform_read_delegated_module(uuid,text) is
'Returns only allowlisted non-personal configuration for one independently approved module scope; every read is audited.';
