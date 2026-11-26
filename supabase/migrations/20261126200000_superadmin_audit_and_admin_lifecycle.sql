-- Superadmin audit query/detail and institution administrator lifecycle.
-- Additive, tenant-scoped, append-only and idempotent. Apply only in disposable/local environments during validation.

create table if not exists private.platform_institution_admin_overrides (
  membership_id uuid not null,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  display_name text not null,
  updated_by uuid not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (membership_id, institution_id),
  foreign key (membership_id) references public.memberships(id) on delete cascade
);
alter table private.platform_institution_admin_overrides enable row level security;
revoke all on private.platform_institution_admin_overrides from public, anon, authenticated;

alter table public.memberships
  add column if not exists updated_at timestamptz not null default pg_catalog.now();

create index if not exists platform_audit_events_cursor_idx
  on private.platform_audit_events (occurred_at desc, id desc);
create index if not exists platform_audit_events_action_idx
  on private.platform_audit_events (action, occurred_at desc, id desc);
create index if not exists platform_audit_events_outcome_idx
  on private.platform_audit_events (outcome, occurred_at desc, id desc);

drop function if exists public.platform_list_audit_events(integer, timestamptz, uuid);
create function public.platform_list_audit_events(
  p_limit integer default 50,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_institution_id uuid default null,
  p_action text default null,
  p_actor_user_id uuid default null,
  p_outcome text default null,
  p_search text default null
)
returns table(
  id uuid, occurred_at timestamptz, actor_user_id uuid, action text, target_type text,
  target_id text, institution_id uuid, reason text, request_id text, outcome text,
  metadata_redacted jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search,'')),'');
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or (p_action is not null and pg_catalog.length(p_action)>160)
    or (p_outcome is not null and p_outcome not in ('success','rejected','started','failed'))
    or (v_search is not null and pg_catalog.length(v_search)>120) then
    raise exception using errcode='22023',message='invalid_audit_filters';
  end if;
  perform private.platform_audit_append(
    'platform.audit.read','audit_collection',null,p_institution_id,
    'Consulta filtrada de bitácora de auditoría',
    'audit-list-'||pg_catalog.gen_random_uuid()::text,'success',
    pg_catalog.jsonb_build_object('limit',p_limit,'institution_filter',p_institution_id is not null,
      'action_filter',p_action is not null,'actor_filter',p_actor_user_id is not null,
      'outcome_filter',p_outcome,'search_used',v_search is not null)
  );
  return query
  select e.id,e.occurred_at,e.actor_user_id,e.action,e.target_type,e.target_id,
    e.institution_id,e.reason,e.request_id,e.outcome,e.metadata_redacted
  from private.platform_audit_events e
  where (p_institution_id is null or e.institution_id=p_institution_id)
    and (p_action is null or e.action=p_action)
    and (p_actor_user_id is null or e.actor_user_id=p_actor_user_id)
    and (p_outcome is null or e.outcome=p_outcome)
    and (v_search is null or (
      e.action ilike '%'||pg_catalog.replace(v_search,'%','')||'%'
      or e.target_type ilike '%'||pg_catalog.replace(v_search,'%','')||'%'
      or coalesce(e.target_id,'') ilike '%'||pg_catalog.replace(v_search,'%','')||'%'
      or e.reason ilike '%'||pg_catalog.replace(v_search,'%','')||'%'
      or e.request_id ilike '%'||pg_catalog.replace(v_search,'%','')||'%'
      or e.actor_user_id::text ilike '%'||pg_catalog.replace(v_search,'%','')||'%'
      or e.metadata_redacted::text ilike '%'||pg_catalog.replace(v_search,'%','')||'%'
    ))
    and (
      p_before is null
      or (p_before_id is null and e.occurred_at<p_before)
      or (p_before_id is not null and (e.occurred_at,e.id)<(p_before,p_before_id))
    )
  order by e.occurred_at desc,e.id desc
  limit p_limit;
end;
$$;
revoke all on function public.platform_list_audit_events(integer,timestamptz,uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.platform_list_audit_events(integer,timestamptz,uuid,uuid,text,uuid,text,text) to authenticated;

create or replace function public.platform_get_audit_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event private.platform_audit_events%rowtype;
begin
  perform private.require_platform_superadmin();
  select * into v_event from private.platform_audit_events where id=p_event_id;
  if not found then
    raise exception using errcode='P0002',message='audit_event_not_found';
  end if;
  perform private.platform_audit_append(
    'platform.audit.detail.read','audit_event',p_event_id::text,v_event.institution_id,
    'Consulta del detalle de un evento de auditoría',
    'audit-detail-'||pg_catalog.gen_random_uuid()::text,'success',
    pg_catalog.jsonb_build_object('event_action',v_event.action,'event_outcome',v_event.outcome)
  );
  return pg_catalog.jsonb_build_object(
    'id',v_event.id,'occurred_at',v_event.occurred_at,'actor_user_id',v_event.actor_user_id,
    'action',v_event.action,'target_type',v_event.target_type,'target_id',v_event.target_id,
    'institution_id',v_event.institution_id,'reason',v_event.reason,'request_id',v_event.request_id,
    'outcome',v_event.outcome,'metadata_redacted',v_event.metadata_redacted
  );
end;
$$;
revoke all on function public.platform_get_audit_event(uuid) from public,anon;
grant execute on function public.platform_get_audit_event(uuid) to authenticated;

drop function if exists public.platform_list_institution_admins(uuid);
create function public.platform_list_institution_admins(p_institution_id uuid)
returns table(
  membership_id uuid,user_id uuid,email text,display_name text,status text,
  assigned_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_superadmin();
  if not exists(select 1 from public.institutions where id=p_institution_id) then
    raise exception using errcode='P0002',message='institution_not_found';
  end if;
  perform private.platform_audit_append(
    'platform.institution.admin.list','institution_admin_collection',p_institution_id::text,p_institution_id,
    'Consulta de administradores institucionales',
    'institution-admins-'||pg_catalog.gen_random_uuid()::text,'success','{}'::jsonb
  );
  return query
  select m.id,m.user_id,u.email::text,
    coalesce(o.display_name,p.display_name),m.status,mr.assigned_at,m.updated_at
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id and r.key='institution_admin'
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.id=m.user_id
  left join private.platform_institution_admin_overrides o
    on o.membership_id=m.id and o.institution_id=m.institution_id
  where m.institution_id=p_institution_id
  order by m.created_at desc,m.id;
end;
$$;
revoke all on function public.platform_list_institution_admins(uuid) from public,anon;
grant execute on function public.platform_list_institution_admins(uuid) to authenticated;

create or replace function public.platform_update_institution_admin(
  p_institution_id uuid,p_membership_id uuid,p_display_name text,
  p_expected_updated_at timestamptz,p_reason text,p_request_id text,p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=private.require_platform_superadmin();
  v_claim jsonb;
  v_role_id uuid;
  v_target uuid;
  v_status text;
  v_updated timestamptz;
  v_result jsonb;
  v_name text:=pg_catalog.btrim(coalesce(p_display_name,''));
begin
  if p_institution_id is null or p_membership_id is null
    or pg_catalog.length(v_name)<2 or pg_catalog.length(v_name)>120
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12
    or p_expected_updated_at is null then
    raise exception using errcode='22023',message='invalid_institution_admin_update';
  end if;
  v_claim:=private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.admin.update',
    pg_catalog.jsonb_build_object('institution',p_institution_id,'membership',p_membership_id,
      'display_name',v_name,'expected_updated_at',p_expected_updated_at,'reason',p_reason));
  if v_claim->>'claimed'='false' then return v_claim->'result'; end if;

  perform 1 from public.institutions where id=p_institution_id for update;
  if not found then raise exception using errcode='P0002',message='institution_not_found'; end if;
  select m.user_id,m.status,m.updated_at into v_target,v_status,v_updated
  from public.memberships m
  where m.id=p_membership_id and m.institution_id=p_institution_id
  for update;
  if not found then raise exception using errcode='P0002',message='institution_admin_membership_not_found'; end if;
  select id into v_role_id from public.roles where key='institution_admin';
  if v_role_id is null or not exists(
    select 1 from public.membership_roles mr
    where mr.membership_id=p_membership_id and mr.institution_id=p_institution_id and mr.role_id=v_role_id
  ) then raise exception using errcode='42501',message='membership_is_not_institution_admin'; end if;
  if v_status not in ('active','suspended') then
    raise exception using errcode='23514',message='administrator_not_editable_in_current_status';
  end if;
  if v_updated is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='institution_admin_version_conflict';
  end if;

  v_updated:=pg_catalog.clock_timestamp();
  insert into private.platform_institution_admin_overrides(membership_id,institution_id,display_name,updated_by,updated_at)
  values(p_membership_id,p_institution_id,v_name,v_actor,v_updated)
  on conflict(membership_id,institution_id) do update
    set display_name=excluded.display_name,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  update public.memberships set updated_at=v_updated
  where id=p_membership_id and institution_id=p_institution_id;

  v_result:=pg_catalog.jsonb_build_object('membership_id',p_membership_id,'institution_id',p_institution_id,
    'user_id',v_target,'display_name',v_name,'status',v_status,'updated_at',v_updated);
  perform private.platform_audit_append('platform.institution.admin.update','membership',p_membership_id::text,
    p_institution_id,p_reason,p_request_id,'success',
    pg_catalog.jsonb_build_object('target_user_id',v_target,'changed_fields',pg_catalog.jsonb_build_array('display_name')));
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;
revoke all on function public.platform_update_institution_admin(uuid,uuid,text,timestamptz,text,text,text) from public,anon;
grant execute on function public.platform_update_institution_admin(uuid,uuid,text,timestamptz,text,text,text) to authenticated;

create or replace function public.platform_set_institution_admin_status(
  p_institution_id uuid,p_membership_id uuid,p_status text,
  p_expected_updated_at timestamptz,p_reason text,p_request_id text,p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=private.require_platform_superadmin();
  v_claim jsonb;
  v_role_id uuid;
  v_target uuid;
  v_old_status text;
  v_updated timestamptz;
  v_active_count integer;
  v_result jsonb;
begin
  if p_institution_id is null or p_membership_id is null
    or p_status not in ('active','suspended')
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12
    or p_expected_updated_at is null then
    raise exception using errcode='22023',message='invalid_institution_admin_status';
  end if;
  v_claim:=private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.admin.status',
    pg_catalog.jsonb_build_object('institution',p_institution_id,'membership',p_membership_id,
      'status',p_status,'expected_updated_at',p_expected_updated_at,'reason',p_reason));
  if v_claim->>'claimed'='false' then return v_claim->'result'; end if;

  -- Serializes all administrator lifecycle transitions for this institution.
  perform 1 from public.institutions where id=p_institution_id for update;
  if not found then raise exception using errcode='P0002',message='institution_not_found'; end if;
  select m.user_id,m.status,m.updated_at into v_target,v_old_status,v_updated
  from public.memberships m
  where m.id=p_membership_id and m.institution_id=p_institution_id
  for update;
  if not found then raise exception using errcode='P0002',message='institution_admin_membership_not_found'; end if;
  select id into v_role_id from public.roles where key='institution_admin';
  if v_role_id is null or not exists(
    select 1 from public.membership_roles mr
    where mr.membership_id=p_membership_id and mr.institution_id=p_institution_id and mr.role_id=v_role_id
  ) then raise exception using errcode='42501',message='membership_is_not_institution_admin'; end if;
  if v_old_status not in ('active','suspended') then
    raise exception using errcode='23514',message='administrator_not_transitionable_in_current_status';
  end if;
  if v_updated is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='institution_admin_version_conflict';
  end if;
  if v_old_status='active' and p_status='suspended' then
    select count(*) into v_active_count
    from public.memberships m
    join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
    where m.institution_id=p_institution_id and m.status='active' and mr.role_id=v_role_id;
    if v_active_count<=1 then
      raise exception using errcode='23514',message='cannot_suspend_last_institution_admin';
    end if;
  end if;

  v_updated:=pg_catalog.clock_timestamp();
  update public.memberships set status=p_status,updated_at=v_updated
  where id=p_membership_id and institution_id=p_institution_id;
  v_result:=pg_catalog.jsonb_build_object('membership_id',p_membership_id,'institution_id',p_institution_id,
    'user_id',v_target,'status',p_status,'previous_status',v_old_status,'updated_at',v_updated);
  perform private.platform_audit_append('platform.institution.admin.status','membership',p_membership_id::text,
    p_institution_id,p_reason,p_request_id,'success',
    pg_catalog.jsonb_build_object('target_user_id',v_target,'before',v_old_status,'after',p_status));
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;
revoke all on function public.platform_set_institution_admin_status(uuid,uuid,text,timestamptz,text,text,text) from public,anon;
grant execute on function public.platform_set_institution_admin_status(uuid,uuid,text,timestamptz,text,text,text) to authenticated;
