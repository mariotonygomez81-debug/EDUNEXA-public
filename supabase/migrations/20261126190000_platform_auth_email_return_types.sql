-- Align Supabase Auth varchar email columns with the public RPC text return contracts.
-- Additive correction for installations that already applied the original control-plane migrations.
create or replace function public.platform_list_superadmins()
returns table(user_id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_superadmin();
  perform private.platform_audit_append('platform.superadmin.list','superadmin_collection',null,null,
    'Consulta del registro de Superadministradores','superadmins-'||pg_catalog.gen_random_uuid()::text,'success','{}'::jsonb);
  return query
  select u.id,u.email::text,u.created_at,u.last_sign_in_at
  from auth.users u
  where u.raw_app_meta_data->>'platform_role'='superadmin'
  order by u.created_at asc,u.id;
end;
$$;

revoke all on function public.platform_list_superadmins() from public,anon;
grant execute on function public.platform_list_superadmins() to authenticated;

create or replace function public.platform_list_institution_admins(p_institution_id uuid)
returns table(membership_id uuid,user_id uuid,email text,display_name text,status text,assigned_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_superadmin();
  if not exists(select 1 from public.institutions where id=p_institution_id) then
    raise exception using errcode='P0002',message='institution_not_found';
  end if;
  perform private.platform_audit_append('platform.institution.admin.list','institution_admin_collection',p_institution_id::text,p_institution_id,
    'Consulta de administradores institucionales','institution-admins-'||pg_catalog.gen_random_uuid()::text,'success','{}'::jsonb);
  return query
  select m.id,m.user_id,u.email::text,p.display_name,m.status,mr.assigned_at
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id and r.key='institution_admin'
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.id=m.user_id
  where m.institution_id=p_institution_id
  order by m.created_at desc,m.id;
end;
$$;

revoke all on function public.platform_list_institution_admins(uuid) from public,anon;
grant execute on function public.platform_list_institution_admins(uuid) to authenticated;

create or replace function public.platform_list_superadmin_change_requests(p_limit integer default 50)
returns table (
  request_id uuid,
  target_user_id uuid,
  target_email text,
  requested_action text,
  requested_by uuid,
  requested_by_email text,
  approved_by uuid,
  approved_by_email text,
  executed_by uuid,
  status text,
  reason text,
  created_at timestamptz,
  approved_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  failure_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_superadmin();
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode='22023', message='invalid_limit';
  end if;
  perform private.platform_audit_append(
    'platform.superadmin.change_requests.list',
    'superadmin_change_request_collection',
    null,
    null,
    'Consulta de solicitudes de privilegios globales',
    'superadmin-change-requests-' || pg_catalog.gen_random_uuid()::text,
    'success',
    jsonb_build_object('limit',p_limit)
  );
  return query
  select r.id,r.target_user_id,target.email::text,r.requested_action,
    r.requested_by,requester.email::text,r.approved_by,approver.email::text,r.executed_by,
    r.status,r.reason,r.created_at,r.approved_at,r.claimed_at,r.completed_at,r.failure_code
  from private.platform_superadmin_change_requests r
  join auth.users target on target.id=r.target_user_id
  join auth.users requester on requester.id=r.requested_by
  left join auth.users approver on approver.id=r.approved_by
  order by r.created_at desc,r.id desc
  limit p_limit;
end;
$$;

revoke all on function public.platform_list_superadmin_change_requests(integer) from public,anon;
grant execute on function public.platform_list_superadmin_change_requests(integer) to authenticated;
