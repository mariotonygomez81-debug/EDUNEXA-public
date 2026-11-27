-- Institution administrators approve invited administrator memberships within their own tenant.
-- This is intentionally separate from the global Superadmin invitation RPC.
create or replace function public.platform_approve_institution_admin(
  p_institution_id uuid,
  p_membership_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target_user uuid;
  v_status text;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='institution_admin_authentication_required';
  end if;
  if p_institution_id is null or p_membership_id is null
    or p_request_id is null
    or p_request_id !~ '^[A-Za-z0-9._:-]{12,128}$' then
    raise exception using errcode='22023',message='invalid_institution_admin_approval';
  end if;

  if not exists (
    select 1
    from public.memberships actor_membership
    join public.membership_roles actor_role
      on actor_role.membership_id=actor_membership.id
     and actor_role.institution_id=actor_membership.institution_id
    join public.roles role_record on role_record.id=actor_role.role_id
    join public.institutions institution
      on institution.id=actor_membership.institution_id
    where actor_membership.institution_id=p_institution_id
      and actor_membership.user_id=v_actor
      and actor_membership.status='active'
      and role_record.key='institution_admin'
      and institution.status='active'
  ) then
    raise exception using errcode='42501',message='active_institution_admin_required';
  end if;

  select invited.user_id,invited.status
    into v_target_user,v_status
  from public.memberships invited
  where invited.id=p_membership_id
    and invited.institution_id=p_institution_id
  for update;

  if not found or v_status<>'invited' then
    raise exception using errcode='P0002',message='pending_institution_admin_invitation_not_found';
  end if;
  if v_target_user=v_actor then
    raise exception using errcode='42501',message='self_approval_forbidden';
  end if;

  update public.memberships
     set status='active'
   where id=p_membership_id
     and institution_id=p_institution_id
     and status='invited';

  insert into private.platform_audit_events(
    actor_user_id,action,target_type,target_id,institution_id,
    reason,request_id,outcome,metadata_redacted
  ) values (
    v_actor,'platform.institution.admin.approve','membership',p_membership_id::text,
    p_institution_id,'Aprobación institucional de invitación de administrador',
    p_request_id,'success',
    jsonb_build_object('target_user_id',v_target_user,'membership_status','active')
  );

  return jsonb_build_object(
    'membership_id',p_membership_id,
    'institution_id',p_institution_id,
    'user_id',v_target_user,
    'status','active',
    'approved_by',v_actor
  );
end;
$$;

revoke all on function public.platform_approve_institution_admin(uuid,uuid,text) from public,anon;
grant execute on function public.platform_approve_institution_admin(uuid,uuid,text) to authenticated;

comment on function public.platform_approve_institution_admin(uuid,uuid,text) is
'Activates a pending institution_admin membership only after an active administrator of the same institution approves it; records an append-only audit event.';
