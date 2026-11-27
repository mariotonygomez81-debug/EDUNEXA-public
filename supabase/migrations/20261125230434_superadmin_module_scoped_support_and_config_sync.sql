-- EDUNEXA: synchronize real institutional configuration into the isolated clone registry
-- and scope delegated support to explicitly approved, read-only modules.
-- Repository-only migration: do not apply to hosted Supabase without explicit authorization.

alter table private.platform_delegations
  add column if not exists module_scope text[] not null default '{}';
-- The legacy request function runs inside the scoped wrapper; its temporary default is least-privilege.
alter table private.platform_delegations
  alter column module_scope set default array['administrador']::text[];

-- Existing unscoped grants are revoked rather than silently widened to every module.
with revoked as (
  update private.platform_delegations
    set status='revoked',revoked_at=coalesce(revoked_at,pg_catalog.now()),
        module_scope=array['administrador']::text[]
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
    cardinality(module_scope) between 1 and 7
    and module_scope <@ array[
      'docentes','preceptor','alumnos','tutor','directivos','administrativos','administrador'
    ]::text[]
  );

alter table private.platform_institution_clone_config
  drop constraint if exists platform_institution_clone_config_config_key_check;
alter table private.platform_institution_clone_config
  add constraint platform_institution_clone_config_config_key_check
  check (config_key in (
    'branding','institution_profile','academic_calendar','grading_scales','academic_structure',
    'timetable_templates','notification_templates','module_settings'
  ));

create or replace function private.platform_refresh_institution_clone_config(p_institution_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile jsonb;
  v_calendar jsonb;
  v_scales jsonb;
  v_structure jsonb;
begin
  if p_institution_id is null then return; end if;

  select jsonb_build_object('locale',i.locale,'timezone',i.timezone)
    into v_profile from public.institutions i where i.id=p_institution_id;

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
    'campuses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',cp.name,'code',cp.code,'is_main',cp.is_main
      ) order by cp.is_main desc,cp.name)
      from public.campuses cp where cp.institution_id=p_institution_id
    ), '[]'::jsonb),
    'divisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'course_name',c.name,'academic_year_name',ay.name,'campus_name',cp.name,
        'name',d.name,'capacity',d.capacity
      ) order by ay.starts_on,c.name,d.name)
      from public.divisions d
      join public.courses c on c.id=d.course_id and c.institution_id=d.institution_id
      join public.academic_years ay on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
      left join public.campuses cp on cp.id=d.campus_id and cp.institution_id=d.institution_id
      where d.institution_id=p_institution_id
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

  if not private.platform_clone_json_is_safe(v_profile)
    or not private.platform_clone_json_is_safe(v_calendar)
    or not private.platform_clone_json_is_safe(v_scales)
    or not private.platform_clone_json_is_safe(v_structure) then
    raise exception using errcode='23514', message='unsafe_institution_configuration_snapshot';
  end if;

  insert into private.platform_institution_clone_config(institution_id,config_key,config_value)
  values
    (p_institution_id,'institution_profile',coalesce(v_profile,'{}'::jsonb)),
    (p_institution_id,'academic_calendar',v_calendar),
    (p_institution_id,'grading_scales',v_scales),
    (p_institution_id,'academic_structure',v_structure)
  on conflict(institution_id,config_key) do update
    set config_value=excluded.config_value,updated_at=pg_catalog.now();
end;
$$;

create or replace function private.platform_refresh_institution_profile_clone_config_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.platform_refresh_institution_clone_config(new.id);
  return new;
end;
$$;

drop trigger if exists platform_clone_snapshot_institution_profile on public.institutions;
create trigger platform_clone_snapshot_institution_profile
after insert or update on public.institutions
for each row execute function private.platform_refresh_institution_profile_clone_config_trigger();

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
$$;

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
drop trigger if exists platform_clone_snapshot_campuses on public.campuses;
create trigger platform_clone_snapshot_campuses
after insert or update or delete on public.campuses
for each row execute function private.platform_refresh_institution_clone_config_trigger();
drop trigger if exists platform_clone_snapshot_divisions on public.divisions;
create trigger platform_clone_snapshot_divisions
after insert or update or delete on public.divisions
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

create or replace function private.has_active_delegated_module_scope(
  p_institution_id uuid,p_module_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.platform_delegations d
    join auth.users u on u.id=d.requested_by
    join public.institutions i on i.id=d.institution_id
    where d.institution_id=p_institution_id
      and d.requested_by=auth.uid()
      and u.raw_app_meta_data->>'platform_role'='superadmin'
      and d.status='active'
      and d.approved_by is not null and d.approved_by<>d.requested_by
      and d.expires_at>pg_catalog.now()
      and i.status='active'
      and p_module_key=any(d.module_scope)
  );
$$;

-- Defense in depth: even if table SELECT is granted in a future release,
-- each module sees only its own configuration categories and only during its grant.
drop policy if exists platform_delegated_config_docentes_select on private.platform_institution_clone_config;
create policy platform_delegated_config_docentes_select on private.platform_institution_clone_config
for select to authenticated
using (config_key='academic_structure' and private.has_active_delegated_module_scope(institution_id,'docentes'));
drop policy if exists platform_delegated_config_preceptor_select on private.platform_institution_clone_config;
create policy platform_delegated_config_preceptor_select on private.platform_institution_clone_config
for select to authenticated
using (config_key in ('academic_structure','academic_calendar') and private.has_active_delegated_module_scope(institution_id,'preceptor'));
drop policy if exists platform_delegated_config_alumnos_select on private.platform_institution_clone_config;
create policy platform_delegated_config_alumnos_select on private.platform_institution_clone_config
for select to authenticated
using (config_key in ('academic_calendar','grading_scales') and private.has_active_delegated_module_scope(institution_id,'alumnos'));
drop policy if exists platform_delegated_config_tutor_select on private.platform_institution_clone_config;
create policy platform_delegated_config_tutor_select on private.platform_institution_clone_config
for select to authenticated
using (config_key='academic_calendar' and private.has_active_delegated_module_scope(institution_id,'tutor'));
drop policy if exists platform_delegated_config_directivos_select on private.platform_institution_clone_config;
create policy platform_delegated_config_directivos_select on private.platform_institution_clone_config
for select to authenticated
using (config_key in ('academic_calendar','grading_scales','academic_structure') and private.has_active_delegated_module_scope(institution_id,'directivos'));
drop policy if exists platform_delegated_config_administrativos_select on private.platform_institution_clone_config;
create policy platform_delegated_config_administrativos_select on private.platform_institution_clone_config
for select to authenticated
using (config_key='academic_structure' and private.has_active_delegated_module_scope(institution_id,'administrativos'));
drop policy if exists platform_delegated_config_administrador_select on private.platform_institution_clone_config;
create policy platform_delegated_config_administrador_select on private.platform_institution_clone_config
for select to authenticated
using (config_key in ('institution_profile','academic_calendar','grading_scales','academic_structure','branding','module_settings')
  and private.has_active_delegated_module_scope(institution_id,'administrador'));

create or replace function private.platform_clone_materialize_academic_configuration(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.platform_clone_jobs%rowtype;
  v_profile jsonb;
  v_row record;
  v_target_id uuid;
  v_scale_id uuid;
  v_level_id uuid;
  v_course_id uuid;
  v_subject_id uuid;
  v_campus_id uuid;
  v_count integer:=0;
  v_rows integer:=0;
begin
  select * into v_job from private.platform_clone_jobs where id=p_job_id for update;
  if not found or v_job.status<>'completed' or v_job.approved_by is null
    or v_job.copy_mode<>'configuration_only' or v_job.source_institution_id=v_job.target_institution_id then
    raise exception using errcode='23514',message='clone_materialization_requires_completed_approved_job';
  end if;
  if not exists(select 1 from public.institutions i where i.id=v_job.target_institution_id and i.status='pending')
    or exists(select 1 from public.memberships m where m.institution_id=v_job.target_institution_id) then
    raise exception using errcode='23514',message='clone_target_must_be_pending_and_have_no_memberships';
  end if;
  select c.config_value into v_profile
  from private.platform_institution_clone_config c
  where c.institution_id=v_job.source_institution_id and c.config_key='institution_profile';
  if v_profile is null or not private.platform_clone_json_is_safe(v_profile)
    or coalesce(v_profile->>'locale','')='' or coalesce(v_profile->>'timezone','')='' then
    raise exception using errcode='23514',message='safe_institution_profile_snapshot_required';
  end if;
  update public.institutions target
    set locale=v_profile->>'locale',timezone=v_profile->>'timezone'
  where target.id=v_job.target_institution_id;
  if exists (
    select 1 from private.platform_institution_clone_config c
    where c.institution_id=v_job.source_institution_id
      and not private.platform_clone_json_is_safe(c.config_value)
  ) then
    raise exception using errcode='23514',message='unsafe_clone_configuration_rejected';
  end if;

  create temporary table edunexa_clone_scale_map(source_id uuid primary key,target_id uuid not null) on commit drop;
  create temporary table edunexa_clone_year_map(source_id uuid primary key,target_id uuid not null) on commit drop;
  create temporary table edunexa_clone_level_map(source_id uuid primary key,target_id uuid not null) on commit drop;
  create temporary table edunexa_clone_course_map(source_id uuid primary key,target_id uuid not null) on commit drop;
  create temporary table edunexa_clone_subject_map(source_id uuid primary key,target_id uuid not null) on commit drop;
  create temporary table edunexa_clone_campus_map(source_id uuid primary key,target_id uuid not null) on commit drop;
  truncate table pg_temp.edunexa_clone_scale_map,pg_temp.edunexa_clone_year_map,
    pg_temp.edunexa_clone_level_map,pg_temp.edunexa_clone_course_map,pg_temp.edunexa_clone_subject_map,
    pg_temp.edunexa_clone_campus_map;

  for v_row in
    select id,name,description,display_mode,minimum_value,maximum_value,passing_value
    from public.grading_scales where institution_id=v_job.source_institution_id order by name
  loop
    insert into public.grading_scales(institution_id,name,description,display_mode,minimum_value,maximum_value,passing_value)
    values(v_job.target_institution_id,v_row.name,v_row.description,v_row.display_mode,
      v_row.minimum_value,v_row.maximum_value,v_row.passing_value)
    on conflict(institution_id,name) do nothing;
    select id into v_scale_id from public.grading_scales
      where institution_id=v_job.target_institution_id and name=v_row.name;
    insert into pg_temp.edunexa_clone_scale_map(source_id,target_id) values(v_row.id,v_scale_id);
    v_count:=v_count+1;
  end loop;

  insert into public.grading_scale_levels(
    institution_id,grading_scale_id,minimum_percentage,maximum_percentage,label,grade_value,is_passing,sort_order
  )
  select v_job.target_institution_id,m.target_id,l.minimum_percentage,l.maximum_percentage,
    l.label,l.grade_value,l.is_passing,l.sort_order
  from public.grading_scale_levels l
  join pg_temp.edunexa_clone_scale_map m on m.source_id=l.grading_scale_id
  where l.institution_id=v_job.source_institution_id;
  get diagnostics v_rows = row_count;
  v_count:=v_count+v_rows;

  for v_row in
    select id,name,starts_on,ends_on,status,grading_scale_id
    from public.academic_years where institution_id=v_job.source_institution_id order by starts_on,name
  loop
    select target_id into v_scale_id from pg_temp.edunexa_clone_scale_map where source_id=v_row.grading_scale_id;
    insert into public.academic_years(institution_id,name,starts_on,ends_on,status,grading_scale_id)
    values(v_job.target_institution_id,v_row.name,v_row.starts_on,v_row.ends_on,
      case when v_row.status='active' then 'planned' else v_row.status end,v_scale_id)
    returning id into v_target_id;
    insert into pg_temp.edunexa_clone_year_map(source_id,target_id) values(v_row.id,v_target_id);
    v_count:=v_count+1;
  end loop;

  insert into public.grading_periods(institution_id,academic_year_id,name,starts_on,ends_on,sort_order)
  select v_job.target_institution_id,m.target_id,p.name,p.starts_on,p.ends_on,p.sort_order
  from public.grading_periods p
  join pg_temp.edunexa_clone_year_map m on m.source_id=p.academic_year_id
  where p.institution_id=v_job.source_institution_id;
  get diagnostics v_rows = row_count;
  v_count:=v_count+v_rows;

  for v_row in
    select id,name,code,sort_order from public.education_levels
    where institution_id=v_job.source_institution_id order by sort_order,name
  loop
    insert into public.education_levels(institution_id,name,code,sort_order)
    values(v_job.target_institution_id,v_row.name,v_row.code,v_row.sort_order)
    returning id into v_level_id;
    insert into pg_temp.edunexa_clone_level_map(source_id,target_id) values(v_row.id,v_level_id);
    v_count:=v_count+1;
  end loop;

  for v_row in
    select id,level_id,name,grade_number,shift from public.courses
    where institution_id=v_job.source_institution_id order by name
  loop
    select target_id into v_level_id from pg_temp.edunexa_clone_level_map where source_id=v_row.level_id;
    insert into public.courses(institution_id,level_id,name,grade_number,shift)
    values(v_job.target_institution_id,v_level_id,v_row.name,v_row.grade_number,v_row.shift)
    returning id into v_course_id;
    insert into pg_temp.edunexa_clone_course_map(source_id,target_id) values(v_row.id,v_course_id);
    v_count:=v_count+1;
  end loop;

  for v_row in
    select id,name,code,is_main from public.campuses
    where institution_id=v_job.source_institution_id order by is_main desc,name
  loop
    insert into public.campuses(institution_id,name,code,is_main)
    values(v_job.target_institution_id,v_row.name,v_row.code,v_row.is_main)
    returning id into v_campus_id;
    insert into pg_temp.edunexa_clone_campus_map(source_id,target_id) values(v_row.id,v_campus_id);
    v_count:=v_count+1;
  end loop;

  insert into public.divisions(institution_id,course_id,campus_id,academic_year_id,name,capacity)
  select v_job.target_institution_id,cm.target_id,cp.target_id,ym.target_id,d.name,d.capacity
  from public.divisions d
  join pg_temp.edunexa_clone_course_map cm on cm.source_id=d.course_id
  join pg_temp.edunexa_clone_year_map ym on ym.source_id=d.academic_year_id
  left join pg_temp.edunexa_clone_campus_map cp on cp.source_id=d.campus_id
  where d.institution_id=v_job.source_institution_id;
  get diagnostics v_rows = row_count;
  v_count:=v_count+v_rows;

  for v_row in
    select id,name,code from public.subjects where institution_id=v_job.source_institution_id order by name
  loop
    insert into public.subjects(institution_id,name,code)
    values(v_job.target_institution_id,v_row.name,v_row.code)
    returning id into v_subject_id;
    insert into pg_temp.edunexa_clone_subject_map(source_id,target_id) values(v_row.id,v_subject_id);
    v_count:=v_count+1;
  end loop;

  insert into public.course_subjects(institution_id,course_id,subject_id,weekly_hours)
  select v_job.target_institution_id,cm.target_id,sm.target_id,cs.weekly_hours
  from public.course_subjects cs
  join pg_temp.edunexa_clone_course_map cm on cm.source_id=cs.course_id
  join pg_temp.edunexa_clone_subject_map sm on sm.source_id=cs.subject_id
  where cs.institution_id=v_job.source_institution_id;
  get diagnostics v_rows = row_count;
  v_count:=v_count+v_rows;

  return v_count;
end;
$$;

create or replace function private.platform_clone_materialize_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if old.status is distinct from new.status and new.status='completed' then
    v_count:=private.platform_clone_materialize_academic_configuration(new.id);
    perform private.platform_audit_append('platform.clone.configuration.materialize','clone_job',new.id::text,
      new.target_institution_id,'Materialización transaccional de configuración académica permitida',
      'clone-materialize-'||new.id::text,'success',
      jsonb_build_object('configuration_rows_materialized',v_count,'personal_data_copied',false));
  end if;
  return new;
end;
$$;

drop trigger if exists platform_clone_materialize_configuration on private.platform_clone_jobs;
create trigger platform_clone_materialize_configuration
after update of status on private.platform_clone_jobs
for each row execute function private.platform_clone_materialize_trigger();

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
    when 'administrador' then array['institution_profile','academic_calendar','grading_scales','academic_structure','branding','module_settings']
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
as $$
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
$$;

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
revoke all on function private.platform_refresh_institution_profile_clone_config_trigger() from public,anon,authenticated;
revoke all on function private.has_active_delegated_module_scope(uuid,text) from public,anon;
revoke all on function private.platform_clone_materialize_academic_configuration(uuid) from public,anon,authenticated;
revoke all on function private.platform_clone_materialize_trigger() from public,anon,authenticated;
grant execute on function private.has_active_delegated_module_scope(uuid,text) to authenticated;
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
