-- EDUNEXA global Superadministrator control plane.
-- Repository migration only. It is NOT applied to the hosted Supabase project.
-- All privileged entry points validate trusted app_metadata and write audit events
-- in the same database transaction as their database mutations.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text,
  institution_id uuid,
  reason text not null,
  request_id text not null,
  outcome text not null check (outcome in ('success','rejected','started','failed')),
  metadata_redacted jsonb not null default '{}'::jsonb
);

create index if not exists platform_audit_events_occurred_idx
  on private.platform_audit_events (occurred_at desc, id);
create index if not exists platform_audit_events_actor_idx
  on private.platform_audit_events (actor_user_id, occurred_at desc);
create index if not exists platform_audit_events_institution_idx
  on private.platform_audit_events (institution_id, occurred_at desc);

create or replace function private.reject_platform_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'platform audit events are append-only';
end;
$$;

drop trigger if exists platform_audit_no_update_delete on private.platform_audit_events;
create trigger platform_audit_no_update_delete
before update or delete on private.platform_audit_events
for each row execute function private.reject_platform_audit_mutation();

alter table private.platform_audit_events enable row level security;
revoke all on private.platform_audit_events from public, anon, authenticated;
revoke all on function private.reject_platform_audit_mutation() from public, anon, authenticated;

create table if not exists private.platform_delegations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  requested_by uuid not null,
  approved_by uuid,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','active','revoked','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists platform_delegations_actor_idx
  on private.platform_delegations (requested_by, status, expires_at);
create index if not exists platform_delegations_institution_idx
  on private.platform_delegations (institution_id, status, expires_at);
alter table private.platform_delegations enable row level security;
revoke all on private.platform_delegations from public, anon, authenticated;

create table if not exists private.platform_clone_jobs (
  id uuid primary key default gen_random_uuid(),
  source_institution_id uuid not null references public.institutions(id) on delete restrict,
  target_institution_id uuid not null references public.institutions(id) on delete restrict,
  requested_by uuid not null,
  reason text not null,
  copy_mode text not null default 'configuration_only' check (copy_mode = 'configuration_only'),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result_summary jsonb not null default '{}'::jsonb,
  unique (target_institution_id)
);
alter table private.platform_clone_jobs enable row level security;
revoke all on private.platform_clone_jobs from public, anon, authenticated;

create table if not exists private.platform_superadmin_change_requests (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  requested_action text not null check (requested_action in ('grant','revoke')),
  requested_by uuid not null,
  approved_by uuid,
  status text not null default 'pending' check (status in ('pending','approved','executing','completed','failed','rejected')),
  reason text not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  failure_code text
);
alter table private.platform_superadmin_change_requests enable row level security;
revoke all on private.platform_superadmin_change_requests from public, anon, authenticated;

create table if not exists private.platform_ai_change_plans (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null,
  approved_by uuid,
  provider text not null check (provider = 'groq'),
  instruction_redacted text not null,
  plan jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','failed')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  executed_at timestamptz,
  execution_summary jsonb
);
alter table private.platform_ai_change_plans enable row level security;
revoke all on private.platform_ai_change_plans from public, anon, authenticated;

create table if not exists private.platform_idempotency (
  actor_user_id uuid not null,
  idempotency_key text not null,
  action text not null,
  request_hash text not null,
  status text not null check (status in ('processing','completed')),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, idempotency_key)
);
alter table private.platform_idempotency enable row level security;
revoke all on private.platform_idempotency from public, anon, authenticated;

create or replace function private.require_platform_superadmin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.jwt() -> 'app_metadata' ->> 'platform_role';
begin
  if v_actor is null or v_role is distinct from 'superadmin' then
    raise exception using errcode = '42501', message = 'platform_superadmin_required';
  end if;
  return v_actor;
end;
$$;

create or replace function private.platform_audit_append(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_institution_id uuid,
  p_reason text,
  p_request_id text,
  p_outcome text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_id uuid;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 12
     or pg_catalog.length(p_reason) > 1000
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9._:-]{12,128}$' then
    raise exception using errcode = '22023', message = 'invalid_audit_reason_or_request_id';
  end if;
  insert into private.platform_audit_events (
    actor_user_id, action, target_type, target_id, institution_id,
    reason, request_id, outcome, metadata_redacted
  ) values (
    v_actor, p_action, p_target_type, p_target_id, p_institution_id,
    pg_catalog.btrim(p_reason), p_request_id, p_outcome,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.platform_idempotency_claim(
  p_actor uuid, p_key text, p_action text, p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := pg_catalog.md5(p_action || ':' || coalesce(p_payload,'{}'::jsonb)::text);
  v_row private.platform_idempotency%rowtype;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{16,128}$' then
    raise exception using errcode = '22023', message = 'idempotency_key_required';
  end if;
  insert into private.platform_idempotency(actor_user_id,idempotency_key,action,request_hash,status)
  values (p_actor,p_key,p_action,v_hash,'processing')
  on conflict do nothing;
  if found then return jsonb_build_object('claimed',true); end if;
  select * into v_row from private.platform_idempotency
   where actor_user_id=p_actor and idempotency_key=p_key for update;
  if v_row.action <> p_action or v_row.request_hash <> v_hash then
    raise exception using errcode = '23505', message = 'idempotency_key_reused_with_different_request';
  end if;
  if v_row.status <> 'completed' then
    raise exception using errcode = '55P03', message = 'idempotent_request_in_progress';
  end if;
  return jsonb_build_object('claimed',false,'result',v_row.result);
end;
$$;

create or replace function private.platform_idempotency_complete(
  p_actor uuid, p_key text, p_result jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.platform_idempotency
     set status='completed', result=p_result
   where actor_user_id=p_actor and idempotency_key=p_key and status='processing';
$$;

revoke all on function private.require_platform_superadmin() from public, anon, authenticated;
revoke all on function private.platform_audit_append(text,text,text,uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function private.platform_idempotency_claim(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function private.platform_idempotency_complete(uuid,text,jsonb) from public, anon, authenticated;

create or replace function public.platform_list_institutions(
  p_limit integer default 50,
  p_before timestamptz default null,
  p_status text default null,
  p_search text default null
)
returns table (
  id uuid, display_name text, legal_name text, slug text, status text,
  locale text, timezone text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_platform_superadmin();
begin
  if p_limit < 1 or p_limit > 100 then raise exception using errcode='22023', message='invalid_limit'; end if;
  perform private.platform_audit_append('platform.institutions.list','institution_collection',null,null,
    'Consulta administrativa del inventario global','list-' || pg_catalog.gen_random_uuid()::text,'success',
    jsonb_build_object('limit',p_limit,'status',p_status));
  return query
  select i.id,i.display_name,i.legal_name,i.slug,i.status,i.locale,i.timezone,i.created_at,i.updated_at
  from public.institutions i
  where (p_before is null or i.created_at < p_before)
    and (p_status is null or i.status = p_status)
    and (p_search is null or
      i.display_name ilike '%' || pg_catalog.replace(p_search,'%','') || '%' or
      i.legal_name ilike '%' || pg_catalog.replace(p_search,'%','') || '%' or
      i.slug ilike '%' || pg_catalog.replace(p_search,'%','') || '%')
  order by i.created_at desc,i.id desc
  limit p_limit;
end;
$$;

create or replace function public.platform_create_institution(
  p_display_name text,p_legal_name text,p_slug text,p_reason text,p_request_id text,p_idempotency_key text
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
  v_id uuid;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 12
    or pg_catalog.length(p_display_name) not between 2 and 160
    or pg_catalog.length(p_legal_name) not between 2 and 200
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or pg_catalog.length(p_slug) > 80 then
    raise exception using errcode='22023', message='invalid_institution_payload';
  end if;
  v_claim := private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.create',
    jsonb_build_object('display_name',p_display_name,'legal_name',p_legal_name,'slug',p_slug,'reason',p_reason));
  if v_claim->>'claimed' = 'false' then return v_claim->'result'; end if;
  insert into public.institutions(display_name,legal_name,slug,status,locale,timezone)
  values(pg_catalog.btrim(p_display_name),pg_catalog.btrim(p_legal_name),p_slug,'pending','es-AR','America/Argentina/Buenos_Aires')
  returning id into v_id;
  v_result := jsonb_build_object('id',v_id,'slug',p_slug,'status','pending');
  perform private.platform_audit_append('platform.institution.create','institution',v_id::text,v_id,p_reason,p_request_id,'success',
    jsonb_build_object('slug',p_slug,'status','pending'));
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

create or replace function public.platform_set_institution_status(
  p_institution_id uuid,p_status text,p_expected_updated_at timestamptz,p_reason text,p_request_id text,p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_platform_superadmin(); v_claim jsonb; v_old text; v_updated timestamptz; v_result jsonb;
begin
  if p_status not in ('active','suspended') or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 12 then
    raise exception using errcode='22023', message='invalid_status_transition_payload';
  end if;
  v_claim := private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.status',
    jsonb_build_object('id',p_institution_id,'status',p_status,'expected',p_expected_updated_at,'reason',p_reason));
  if v_claim->>'claimed'='false' then return v_claim->'result'; end if;
  select status into v_old from public.institutions where id=p_institution_id for update;
  if not found then raise exception using errcode='P0002', message='institution_not_found'; end if;
  if not ((v_old='pending' and p_status='active') or (v_old='active' and p_status='suspended') or (v_old='suspended' and p_status='active')) then
    raise exception using errcode='22023', message='invalid_status_transition';
  end if;
  update public.institutions set status=p_status,updated_at=pg_catalog.now()
   where id=p_institution_id and updated_at=p_expected_updated_at returning updated_at into v_updated;
  if v_updated is null then raise exception using errcode='40001', message='institution_version_conflict'; end if;
  v_result:=jsonb_build_object('id',p_institution_id,'previous_status',v_old,'status',p_status,'updated_at',v_updated);
  perform private.platform_audit_append('platform.institution.status','institution',p_institution_id::text,p_institution_id,p_reason,p_request_id,'success',
    jsonb_build_object('before',v_old,'after',p_status));
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

create or replace function public.platform_assign_institution_admin(
  p_institution_id uuid,p_user_id uuid,p_reason text,p_request_id text,p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_claim jsonb; v_role_id uuid; v_membership_id uuid; v_result jsonb;
begin
  if p_user_id is null or p_user_id=v_actor or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12 then
    raise exception using errcode='22023',message='invalid_admin_assignment';
  end if;
  v_claim:=private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.admin.assign',
    jsonb_build_object('institution',p_institution_id,'user',p_user_id,'reason',p_reason));
  if v_claim->>'claimed'='false' then return v_claim->'result'; end if;
  if not exists(select 1 from public.institutions where id=p_institution_id and status='active') then
    raise exception using errcode='P0002',message='active_institution_not_found';
  end if;
  if not exists(select 1 from auth.users where id=p_user_id) then
    raise exception using errcode='P0002',message='auth_user_not_found';
  end if;
  select id into v_role_id from public.roles where key='institution_admin';
  if v_role_id is null then raise exception using errcode='P0002',message='institution_admin_role_missing'; end if;
  select id into v_membership_id from public.memberships where institution_id=p_institution_id and user_id=p_user_id for update;
  if v_membership_id is null then
    insert into public.memberships(institution_id,user_id,status) values(p_institution_id,p_user_id,'active') returning id into v_membership_id;
  else
    update public.memberships set status='active' where id=v_membership_id;
  end if;
  insert into public.membership_roles(membership_id,institution_id,role_id)
  values(v_membership_id,p_institution_id,v_role_id) on conflict do nothing;
  v_result:=jsonb_build_object('membership_id',v_membership_id,'institution_id',p_institution_id,'user_id',p_user_id,'role','institution_admin');
  perform private.platform_audit_append('platform.institution.admin.assign','membership',v_membership_id::text,p_institution_id,p_reason,p_request_id,'success',
    jsonb_build_object('target_user_id',p_user_id,'role','institution_admin'));
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

create or replace function public.platform_revoke_institution_admin(
  p_institution_id uuid,p_membership_id uuid,p_reason text,p_request_id text,p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_claim jsonb; v_target uuid; v_role_id uuid; v_count integer; v_result jsonb;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12 then raise exception using errcode='22023',message='reason_required'; end if;
  v_claim:=private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.admin.revoke',
    jsonb_build_object('institution',p_institution_id,'membership',p_membership_id,'reason',p_reason));
  if v_claim->>'claimed'='false' then return v_claim->'result'; end if;
  select user_id into v_target from public.memberships where id=p_membership_id and institution_id=p_institution_id and status='active' for update;
  if not found then raise exception using errcode='P0002',message='active_admin_membership_not_found'; end if;
  if v_target=v_actor then raise exception using errcode='42501',message='self_revocation_forbidden'; end if;
  select id into v_role_id from public.roles where key='institution_admin';
  if not exists(select 1 from public.membership_roles where membership_id=p_membership_id and institution_id=p_institution_id and role_id=v_role_id) then
    raise exception using errcode='42501',message='membership_is_not_institution_admin';
  end if;
  select count(*) into v_count from public.memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
   where m.institution_id=p_institution_id and m.status='active' and mr.role_id=v_role_id;
  if v_count<=1 then raise exception using errcode='23514',message='cannot_revoke_last_institution_admin'; end if;
  update public.memberships set status='inactive' where id=p_membership_id and institution_id=p_institution_id;
  v_result:=jsonb_build_object('membership_id',p_membership_id,'institution_id',p_institution_id,'status','inactive');
  perform private.platform_audit_append('platform.institution.admin.revoke','membership',p_membership_id::text,p_institution_id,p_reason,p_request_id,'success',
    jsonb_build_object('target_user_id',v_target,'role','institution_admin'));
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

create or replace function public.platform_request_delegation(
  p_institution_id uuid,p_reason text,p_expires_at timestamptz,p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_id uuid;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12
    or p_expires_at<=pg_catalog.now() or p_expires_at>pg_catalog.now()+interval '30 minutes' then
    raise exception using errcode='22023',message='invalid_delegation_reason_or_expiry';
  end if;
  if not exists(select 1 from public.institutions where id=p_institution_id and status='active') then
    raise exception using errcode='P0002',message='active_institution_not_found';
  end if;
  insert into private.platform_delegations(institution_id,requested_by,reason,expires_at)
  values(p_institution_id,v_actor,pg_catalog.btrim(p_reason),p_expires_at) returning id into v_id;
  perform private.platform_audit_append('platform.delegation.request','delegation',v_id::text,p_institution_id,p_reason,p_request_id,'success',
    jsonb_build_object('expires_at',p_expires_at,'status','pending'));
  return v_id;
end;
$$;

create or replace function public.platform_approve_delegation(p_delegation_id uuid,p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_row private.platform_delegations%rowtype;
begin
  select * into v_row from private.platform_delegations where id=p_delegation_id for update;
  if not found or v_row.status<>'pending' then raise exception using errcode='P0002',message='pending_delegation_not_found'; end if;
  if v_row.requested_by=v_actor then raise exception using errcode='42501',message='delegation_requires_second_superadmin'; end if;
  if v_row.expires_at<=pg_catalog.now() then raise exception using errcode='22023',message='delegation_expired'; end if;
  update private.platform_delegations set status='active',approved_by=v_actor,approved_at=pg_catalog.now() where id=p_delegation_id;
  perform private.platform_audit_append('platform.delegation.approve','delegation',p_delegation_id::text,v_row.institution_id,
    'Aprobación independiente de acceso delegado',p_request_id,'success',jsonb_build_object('requested_by',v_row.requested_by,'expires_at',v_row.expires_at));
  return jsonb_build_object('id',p_delegation_id,'status','active','institution_id',v_row.institution_id,'expires_at',v_row.expires_at);
end;
$$;

create or replace function public.platform_request_clone(
  p_source_institution_id uuid,p_display_name text,p_legal_name text,p_slug text,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_target uuid; v_job uuid;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or pg_catalog.length(p_display_name) not between 2 and 160
    or pg_catalog.length(p_legal_name) not between 2 and 200 then
    raise exception using errcode='22023',message='invalid_clone_request';
  end if;
  if not exists(select 1 from public.institutions where id=p_source_institution_id and status='active') then
    raise exception using errcode='P0002',message='active_source_institution_not_found';
  end if;
  insert into public.institutions(display_name,legal_name,slug,status,locale,timezone)
  values(pg_catalog.btrim(p_display_name),pg_catalog.btrim(p_legal_name),p_slug,'pending','es-AR','America/Argentina/Buenos_Aires')
  returning id into v_target;
  insert into private.platform_clone_jobs(source_institution_id,target_institution_id,requested_by,reason)
  values(p_source_institution_id,v_target,v_actor,pg_catalog.btrim(p_reason)) returning id into v_job;
  perform private.platform_audit_append('platform.institution.clone.request','clone_job',v_job::text,v_target,p_reason,p_request_id,'success',
    jsonb_build_object('source_institution_id',p_source_institution_id,'target_institution_id',v_target,'copy_mode','configuration_only','student_data_copied',false));
  return jsonb_build_object('job_id',v_job,'target_institution_id',v_target,'status','queued','copy_mode','configuration_only');
end;
$$;

create or replace function public.platform_create_superadmin_change(
  p_target_user_id uuid,p_action text,p_reason text,p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_id uuid;
begin
  if p_action not in ('grant','revoke') or p_target_user_id=v_actor or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12 then
    raise exception using errcode='22023',message='invalid_superadmin_change_request';
  end if;
  if not exists(select 1 from auth.users where id=p_target_user_id) then raise exception using errcode='P0002',message='auth_user_not_found'; end if;
  if p_action='revoke' and (select count(*) from auth.users where raw_app_meta_data->>'platform_role'='superadmin')<=1 then
    raise exception using errcode='23514',message='cannot_revoke_last_superadmin';
  end if;
  insert into private.platform_superadmin_change_requests(target_user_id,requested_action,requested_by,reason)
  values(p_target_user_id,p_action,v_actor,pg_catalog.btrim(p_reason)) returning id into v_id;
  perform private.platform_audit_append('platform.superadmin.change.request','superadmin_change',v_id::text,null,p_reason,p_request_id,'success',
    jsonb_build_object('target_user_id',p_target_user_id,'requested_action',p_action));
  return v_id;
end;
$$;

create or replace function public.platform_approve_superadmin_change(p_request_id uuid,p_audit_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_row private.platform_superadmin_change_requests%rowtype;
begin
  select * into v_row from private.platform_superadmin_change_requests where id=p_request_id for update;
  if not found or v_row.status<>'pending' then raise exception using errcode='P0002',message='pending_superadmin_request_not_found'; end if;
  if v_row.requested_by=v_actor or v_row.target_user_id=v_actor then raise exception using errcode='42501',message='independent_approval_required'; end if;
  update private.platform_superadmin_change_requests set status='approved',approved_by=v_actor,approved_at=pg_catalog.now() where id=p_request_id;
  perform private.platform_audit_append('platform.superadmin.change.approve','superadmin_change',p_request_id::text,null,
    'Aprobación independiente de cambio de privilegio global',p_audit_request_id,'success',
    jsonb_build_object('target_user_id',v_row.target_user_id,'requested_action',v_row.requested_action));
  return jsonb_build_object('id',p_request_id,'status','approved','target_user_id',v_row.target_user_id,'action',v_row.requested_action);
end;
$$;

create or replace function public.platform_claim_superadmin_change(p_request_id uuid,p_audit_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_row private.platform_superadmin_change_requests%rowtype;
begin
  select * into v_row from private.platform_superadmin_change_requests where id=p_request_id for update;
  if not found or v_row.status<>'approved' then raise exception using errcode='P0002',message='approved_superadmin_request_not_found'; end if;
  if v_row.requested_by=v_actor or v_row.approved_by=v_actor or v_row.target_user_id=v_actor then
    raise exception using errcode='42501',message='executor_must_be_independent';
  end if;
  update private.platform_superadmin_change_requests set status='executing' where id=p_request_id;
  perform private.platform_audit_append('platform.superadmin.change.execute.start','superadmin_change',p_request_id::text,null,
    'Inicio de ejecución de cambio de privilegio aprobado',p_audit_request_id,'started',
    jsonb_build_object('target_user_id',v_row.target_user_id,'requested_action',v_row.requested_action));
  return jsonb_build_object('id',p_request_id,'target_user_id',v_row.target_user_id,'action',v_row.requested_action);
end;
$$;

create or replace function public.platform_finish_superadmin_change(p_request_id uuid,p_success boolean,p_failure_code text,p_audit_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_row private.platform_superadmin_change_requests%rowtype; v_status text;
begin
  select * into v_row from private.platform_superadmin_change_requests where id=p_request_id for update;
  if not found or v_row.status<>'executing' then raise exception using errcode='P0002',message='executing_superadmin_request_not_found'; end if;
  v_status:=case when p_success then 'completed' else 'failed' end;
  update private.platform_superadmin_change_requests set status=v_status,completed_at=pg_catalog.now(),
    failure_code=case when p_success then null else coalesce(p_failure_code,'external_auth_update_failed') end
   where id=p_request_id;
  perform private.platform_audit_append('platform.superadmin.change.execute.finish','superadmin_change',p_request_id::text,null,
    'Resultado de cambio de privilegio global',p_audit_request_id,case when p_success then 'success' else 'failed' end,
    jsonb_build_object('target_user_id',v_row.target_user_id,'requested_action',v_row.requested_action,'status',v_status));
  return jsonb_build_object('id',p_request_id,'status',v_status);
end;
$$;

create or replace function public.platform_create_ai_change_plan(
  p_instruction_redacted text,p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_id uuid;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_instruction_redacted,''))) not between 12 and 4000
    or pg_catalog.jsonb_typeof(p_plan)<>'object'
    or p_plan->>'provider'<>'groq' then
    raise exception using errcode='22023',message='invalid_groq_change_plan';
  end if;
  insert into private.platform_ai_change_plans(requested_by,provider,instruction_redacted,plan)
  values(v_actor,'groq',p_instruction_redacted,p_plan) returning id into v_id;
  perform private.platform_audit_append('platform.copilot.plan.create','ai_change_plan',v_id::text,null,
    'Generación de plan de cambios asistido por Groq','copilot-'||v_id::text,'success',
    jsonb_build_object('provider','groq','status','pending','plan_type',p_plan->>'category'));
  return v_id;
end;
$$;

create or replace function public.platform_approve_ai_change_plan(p_plan_id uuid,p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_row private.platform_ai_change_plans%rowtype;
begin
  select * into v_row from private.platform_ai_change_plans where id=p_plan_id for update;
  if not found or v_row.status<>'pending' then raise exception using errcode='P0002',message='pending_ai_plan_not_found'; end if;
  if v_row.requested_by=v_actor then raise exception using errcode='42501',message='ai_plan_requires_independent_approval'; end if;
  update private.platform_ai_change_plans set status='approved',approved_by=v_actor,approved_at=pg_catalog.now() where id=p_plan_id;
  perform private.platform_audit_append('platform.copilot.plan.approve','ai_change_plan',p_plan_id::text,null,
    'Aprobación independiente de plan de cambios',p_request_id,'success',jsonb_build_object('provider','groq'));
  return jsonb_build_object('id',p_plan_id,'status','approved','execution_enabled',false);
end;
$$;

create or replace function public.platform_list_audit_events(
  p_limit integer default 50,p_before timestamptz default null,p_institution_id uuid default null
)
returns table(id uuid,occurred_at timestamptz,actor_user_id uuid,action text,target_type text,target_id text,
  institution_id uuid,reason text,request_id text,outcome text,metadata_redacted jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_superadmin();
  if p_limit<1 or p_limit>100 then raise exception using errcode='22023',message='invalid_limit'; end if;
  return query select e.id,e.occurred_at,e.actor_user_id,e.action,e.target_type,e.target_id,e.institution_id,
    e.reason,e.request_id,e.outcome,e.metadata_redacted
  from private.platform_audit_events e
  where (p_before is null or e.occurred_at<p_before)
    and (p_institution_id is null or e.institution_id=p_institution_id)
  order by e.occurred_at desc,e.id desc limit p_limit;
end;
$$;

revoke all on function public.platform_list_institutions(integer,timestamptz,text,text) from public,anon;
revoke all on function public.platform_create_institution(text,text,text,text,text,text) from public,anon;
revoke all on function public.platform_set_institution_status(uuid,text,timestamptz,text,text,text) from public,anon;
revoke all on function public.platform_assign_institution_admin(uuid,uuid,text,text,text) from public,anon;
revoke all on function public.platform_revoke_institution_admin(uuid,uuid,text,text,text) from public,anon;
revoke all on function public.platform_request_delegation(uuid,text,timestamptz,text) from public,anon;
revoke all on function public.platform_approve_delegation(uuid,text) from public,anon;
revoke all on function public.platform_request_clone(uuid,text,text,text,text,text) from public,anon;
revoke all on function public.platform_create_superadmin_change(uuid,text,text,text) from public,anon;
revoke all on function public.platform_approve_superadmin_change(uuid,text) from public,anon;
revoke all on function public.platform_claim_superadmin_change(uuid,text) from public,anon;
revoke all on function public.platform_finish_superadmin_change(uuid,boolean,text,text) from public,anon;
revoke all on function public.platform_create_ai_change_plan(text,jsonb) from public,anon;
revoke all on function public.platform_approve_ai_change_plan(uuid,text) from public,anon;
revoke all on function public.platform_list_audit_events(integer,timestamptz,uuid) from public,anon;

grant execute on function public.platform_list_institutions(integer,timestamptz,text,text) to authenticated;
grant execute on function public.platform_create_institution(text,text,text,text,text,text) to authenticated;
grant execute on function public.platform_set_institution_status(uuid,text,timestamptz,text,text,text) to authenticated;
grant execute on function public.platform_assign_institution_admin(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.platform_revoke_institution_admin(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.platform_request_delegation(uuid,text,timestamptz,text) to authenticated;
grant execute on function public.platform_approve_delegation(uuid,text) to authenticated;
grant execute on function public.platform_request_clone(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.platform_create_superadmin_change(uuid,text,text,text) to authenticated;
grant execute on function public.platform_approve_superadmin_change(uuid,text) to authenticated;
grant execute on function public.platform_claim_superadmin_change(uuid,text) to authenticated;
grant execute on function public.platform_finish_superadmin_change(uuid,boolean,text,text) to authenticated;
grant execute on function public.platform_create_ai_change_plan(text,jsonb) to authenticated;
grant execute on function public.platform_approve_ai_change_plan(uuid,text) to authenticated;
grant execute on function public.platform_list_audit_events(integer,timestamptz,uuid) to authenticated;

comment on table private.platform_audit_events is 'Append-only audit ledger for privileged EDUNEXA platform operations. Writes occur inside the same transaction as database mutations.';
comment on table private.platform_delegations is 'Time-bounded institution-scoped support grants requiring approval by a second Superadministrator; never impersonates the institution admin.';
comment on table private.platform_clone_jobs is 'Queued configuration-only clone jobs. Student records, grades, guardians, messages and other personal data are never copied.';
comment on table private.platform_superadmin_change_requests is 'Two-person approval workflow for Auth app_metadata platform-role changes.';
comment on table private.platform_ai_change_plans is 'Groq-generated change plans. Approval is recorded separately; execution is deliberately not enabled by this migration.';
