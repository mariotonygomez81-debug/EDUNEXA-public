-- Invite an existing Auth identity into an institution as a pending institution administrator.
-- The Auth email invitation is sent by the server route; this RPC creates the isolated,
-- auditable membership and role assignment in one PostgreSQL transaction.
create or replace function public.platform_invite_institution_admin(
  p_institution_id uuid,
  p_user_id uuid,
  p_reason text,
  p_request_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_superadmin();
  v_claim jsonb;
  v_role_id uuid;
  v_membership_id uuid;
  v_result jsonb;
begin
  if p_user_id is null or p_user_id=v_actor
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12 then
    raise exception using errcode='22023',message='invalid_admin_invitation';
  end if;

  v_claim:=private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.admin.invite',
    jsonb_build_object('institution',p_institution_id,'user',p_user_id,'reason',p_reason));
  if v_claim->>'claimed'='false' then return v_claim->'result'; end if;

  perform 1 from public.institutions
  where id=p_institution_id and status='active'
  for update;
  if not found then
    raise exception using errcode='P0002',message='active_institution_not_found';
  end if;

  if not exists(select 1 from auth.users where id=p_user_id) then
    raise exception using errcode='P0002',message='auth_user_not_found';
  end if;

  if exists(select 1 from public.memberships where institution_id=p_institution_id and user_id=p_user_id) then
    raise exception using errcode='23505',message='institution_membership_already_exists';
  end if;

  select id into v_role_id from public.roles where key='institution_admin';
  if v_role_id is null then
    raise exception using errcode='P0002',message='institution_admin_role_missing';
  end if;

  insert into public.memberships(institution_id,user_id,status)
  values(p_institution_id,p_user_id,'invited')
  returning id into v_membership_id;

  insert into public.membership_roles(membership_id,institution_id,role_id)
  values(v_membership_id,p_institution_id,v_role_id);

  v_result:=jsonb_build_object(
    'membership_id',v_membership_id,
    'institution_id',p_institution_id,
    'user_id',p_user_id,
    'status','invited',
    'role','institution_admin'
  );

  perform private.platform_audit_append(
    'platform.institution.admin.invite',
    'membership',
    v_membership_id::text,
    p_institution_id,
    p_reason,
    p_request_id,
    'success',
    jsonb_build_object('role','institution_admin','membership_status','invited')
  );
  perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
  return v_result;
end;
$$;

revoke all on function public.platform_invite_institution_admin(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.platform_invite_institution_admin(uuid,uuid,text,text,text) to authenticated;

comment on function public.platform_invite_institution_admin(uuid,uuid,text,text,text) is
'Creates an institution-scoped administrator invitation without activating membership; Auth email is sent by the trusted server route.';
