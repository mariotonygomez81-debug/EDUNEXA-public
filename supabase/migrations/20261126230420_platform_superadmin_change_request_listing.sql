-- Read-only, audited inventory for the global Superadministrator privilege workflow.
-- Repository migration only; CI applies it to ephemeral PostgreSQL fixtures.
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
  select r.id,r.target_user_id,target.email,r.requested_action,
    r.requested_by,requester.email,r.approved_by,approver.email,r.executed_by,
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

comment on function public.platform_list_superadmin_change_requests(integer) is
'Audited Superadministrator-only read of global privilege requests; never exposes Auth metadata or credentials.';
