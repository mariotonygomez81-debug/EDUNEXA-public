-- Complete institutional invitations: acceptance is distinct from administrator activation.
alter table public.memberships
  add column if not exists invitation_accepted_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'announcement','message','grade','attendance','support','assignment_due','account_access'
  ]::text[]));

alter table public.notifications
  drop constraint if exists notifications_resource_type_check;
alter table public.notifications
  add constraint notifications_resource_type_check
  check (resource_type = any (array[
    'announcement','conversation','grade','attendance','support_ticket','assignment','membership'
  ]::text[]);

create index if not exists memberships_pending_invitation_idx
  on public.memberships(institution_id,created_at desc)
  where status='invited';

create or replace function public.approve_institution_membership_invitation(
  p_institution_id uuid,
  p_membership_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_target_user_id uuid;
  v_target_status text;
  v_accepted_at timestamptz;
begin
  if p_institution_id is null or p_membership_id is null or p_actor_user_id is null then
    raise exception 'Datos de habilitación incompletos' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.memberships actor_membership
    join public.membership_roles actor_role
      on actor_role.membership_id=actor_membership.id
     and actor_role.institution_id=actor_membership.institution_id
    join public.roles role_record on role_record.id=actor_role.role_id
    join public.institutions institution on institution.id=actor_membership.institution_id
    where actor_membership.institution_id=p_institution_id
      and actor_membership.user_id=p_actor_user_id
      and actor_membership.status='active'
      and role_record.key='institution_admin'
      and institution.status='active'
  ) then
    raise exception 'Se requiere un administrador institucional activo' using errcode='42501';
  end if;

  select user_id,status,invitation_accepted_at
    into v_target_user_id,v_target_status,v_accepted_at
  from public.memberships
  where id=p_membership_id and institution_id=p_institution_id
  for update;

  if not found or v_target_status<>'invited' or v_accepted_at is null then
    raise exception 'La invitación todavía no fue aceptada por el usuario' using errcode='P0002';
  end if;
  if v_target_user_id=p_actor_user_id then
    raise exception 'No se permite la auto-habilitación' using errcode='42501';
  end if;

  update public.memberships
    set status='active',joined_at=pg_catalog.now()
  where id=p_membership_id and institution_id=p_institution_id and status='invited';

  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  ) values (
    p_institution_id,p_membership_id,'account_access',
    'Tu acceso a EDUNEXA fue habilitado',
    'El administrador de la institución habilitó tu cuenta. Ya podés ingresar a tu espacio educativo.',
    'membership',p_membership_id
  )
  on conflict (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
  do nothing;

  insert into public.audit_logs(
    institution_id,actor_user_id,action,entity_type,entity_id,metadata
  ) values (
    p_institution_id,p_actor_user_id,'membership.approved','membership',p_membership_id::text,
    jsonb_build_object('membership_status','active','notification_created',true)
  );

  return jsonb_build_object(
    'membership_id',p_membership_id,
    'institution_id',p_institution_id,
    'user_id',v_target_user_id,
    'status','active'
  );
end;
$function$;

revoke all on function public.approve_institution_membership_invitation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_institution_membership_invitation(uuid,uuid,uuid) to service_role;

comment on function public.approve_institution_membership_invitation(uuid,uuid,uuid) is
'Atomically enables a previously accepted institution invitation and creates an in-app account-access notification. Executable only by the trusted Edge Function service role.';
