-- DRAFT ONLY — NOT A SUPABASE MIGRATION.
-- This file is a review artifact. Convert it to a timestamped migration only
-- after running `supabase migration new guardian_notification_fanout` in the
-- repository's configured local Supabase CLI environment.
-- Do not execute against production. Validate on the confirmed development DB.

-- 1) Extend the existing notification categories and resource types.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check,
  add constraint notifications_notification_type_check
    check (notification_type in (
      'announcement','message','grade','attendance','support',
      'assignment_due','appointment','report_card'
    )),
  drop constraint if exists notifications_resource_type_check,
  add constraint notifications_resource_type_check
    check (resource_type in (
      'announcement','conversation','grade','attendance','support_ticket',
      'assignment','appointment','report_card'
    ));

alter table public.notification_preferences
  drop constraint if exists notification_preferences_notification_type_check,
  add constraint notification_preferences_notification_type_check
    check (notification_type in (
      'announcement','message','grade','attendance','support',
      'assignment_due','appointment','report_card'
    ));

-- 2) Permit the new categories in the institution-scoped preference RPC.
create or replace function private.set_notification_preference_impl(
  p_institution_id uuid,
  p_notification_type text,
  p_in_app_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_institution_id is null
    or p_notification_type not in (
      'announcement','message','grade','attendance','support',
      'assignment_due','appointment','report_card'
    )
    or p_in_app_enabled is null then
    raise exception 'Invalid notification preference' using errcode='22023';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;

  insert into public.notification_preferences(
    institution_id,membership_id,notification_type,in_app_enabled
  ) values (
    p_institution_id,v_membership_id,p_notification_type,p_in_app_enabled
  )
  on conflict (institution_id,membership_id,notification_type)
  do update set in_app_enabled=excluded.in_app_enabled,updated_at=now();

  return true;
end;
$function$;

revoke all on function private.set_notification_preference_impl(uuid,text,boolean)
  from public,anon;
grant execute on function private.set_notification_preference_impl(uuid,text,boolean)
  to authenticated;

-- 3) Allow a guardian to read a conversation when the other participant
-- was authorized to initiate it. Keep the student-origin exclusion explicit.
create or replace function private.has_current_conversation_access(
  p_institution_id uuid,
  p_conversation_id uuid,
  p_membership_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_counterpart_membership_id uuid;
  v_is_guardian boolean;
begin
  if (select auth.uid()) is null
    or p_institution_id is null
    or p_conversation_id is null
    or p_membership_id is null then
    return false;
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.id=p_membership_id
      and m.institution_id=p_institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  ) then
    return false;
  end if;

  if (
    select count(*) from public.conversation_members cm
    where cm.conversation_id=p_conversation_id
      and cm.institution_id=p_institution_id
  ) <> 2 then
    return false;
  end if;

  select cm.membership_id into v_counterpart_membership_id
  from public.conversation_members cm
  join public.memberships counterpart
    on counterpart.id=cm.membership_id
    and counterpart.institution_id=cm.institution_id
  where cm.conversation_id=p_conversation_id
    and cm.institution_id=p_institution_id
    and cm.membership_id<>p_membership_id
    and counterpart.status='active'
  limit 1;

  if v_counterpart_membership_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.membership_roles mr
    join public.roles r on r.id=mr.role_id
    where mr.membership_id=p_membership_id
      and mr.institution_id=p_institution_id
      and r.key='guardian'
  ) into v_is_guardian;

  -- A student-origin conversation is never visible in the tutor inbox.
  if v_is_guardian and exists (
    select 1
    from public.membership_roles mr
    join public.roles r on r.id=mr.role_id
    where mr.membership_id=v_counterpart_membership_id
      and mr.institution_id=p_institution_id
      and r.key='student'
  ) then
    return false;
  end if;

  return private.can_message_members(
    p_institution_id,p_membership_id,v_counterpart_membership_id
  ) or private.can_message_members(
    p_institution_id,v_counterpart_membership_id,p_membership_id
  );
end;
$function$;

revoke all on function private.has_current_conversation_access(uuid,uuid,uuid)
  from public,anon;
grant execute on function private.has_current_conversation_access(uuid,uuid,uuid)
  to authenticated;

-- 4) New-message fanout: one persistent unread notification per conversation.
-- Repeated messages refresh the notification instead of creating duplicates.
create or replace function private.fanout_guardian_message_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if exists (
    select 1
    from public.membership_roles mr
    join public.roles r on r.id=mr.role_id
    where mr.membership_id=new.sender_membership_id
      and mr.institution_id=new.institution_id
      and r.key='student'
  ) then
    return new;
  end if;

  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,
    title,body,resource_type,resource_id
  )
  select
    new.institution_id,recipient.id,'message',
    'Nuevo mensaje recibido',
    'Tenés un nuevo mensaje en una conversación institucional.',
    'conversation',new.conversation_id
  from public.conversation_members cm
  join public.memberships recipient
    on recipient.id=cm.membership_id
    and recipient.institution_id=cm.institution_id
    and recipient.status='active'
  where cm.conversation_id=new.conversation_id
    and cm.institution_id=new.institution_id
    and cm.membership_id<>new.sender_membership_id
    and exists (
      select 1
      from public.membership_roles mr
      join public.roles r on r.id=mr.role_id
      where mr.membership_id=recipient.id
        and mr.institution_id=recipient.institution_id
        and r.key='guardian'
    )
    and exists (
      select 1 from public.guardians g
      where g.membership_id=recipient.id
        and g.institution_id=recipient.institution_id
        and coalesce(g.receives_notifications,true)
    )
    and private.can_message_members(
      new.institution_id,new.sender_membership_id,recipient.id
    )
    and coalesce((
      select np.in_app_enabled
      from public.notification_preferences np
      where np.institution_id=new.institution_id
        and np.membership_id=recipient.id
        and np.notification_type='message'
    ),true)
  on conflict (
    institution_id,recipient_membership_id,notification_type,resource_type,resource_id
  )
  do update set
    title=excluded.title,
    body=excluded.body,
    created_at=now(),
    read_at=null;

  return new;
end;
$function$;

revoke all on function private.fanout_guardian_message_notification()
  from public,anon,authenticated;
drop trigger if exists messages_fanout_guardian_notification on public.messages;
create trigger messages_fanout_guardian_notification
after insert on public.messages
for each row execute function private.fanout_guardian_message_notification();

-- 5) Appointment fanout: notify the other participant on creation/status change.
create or replace function private.fanout_teacher_guardian_appointment_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor_membership_id uuid;
  v_recipient_membership_id uuid;
  v_title text;
  v_status_label text;
  v_scheduled_label text;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select m.id into v_actor_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=new.institution_id
    and m.status='active'
  limit 1;

  if tg_op='INSERT' then
    v_recipient_membership_id:=new.guardian_membership_id;
    v_title:='Nueva citación';
  elsif v_actor_membership_id=new.guardian_membership_id then
    v_recipient_membership_id:=new.teacher_membership_id;
    v_title:='Respuesta a una citación';
  else
    v_recipient_membership_id:=new.guardian_membership_id;
    v_title:='Actualización de una citación';
  end if;

  v_status_label:=case new.status
    when 'requested' then 'Pendiente de respuesta'
    when 'confirmed' then 'Confirmada'
    when 'rejected' then 'Rechazada'
    when 'declined' then 'Rechazada'
    when 'completed' then 'Realizada'
    when 'cancelled' then 'Cancelada'
    else 'Actualizada'
  end;
  v_scheduled_label:=to_char(
    new.scheduled_at at time zone 'America/Argentina/Buenos_Aires',
    'DD/MM/YYYY HH24:MI'
  );

  if v_recipient_membership_id is null
    or v_recipient_membership_id=v_actor_membership_id then
    return new;
  end if;

  if v_recipient_membership_id=new.guardian_membership_id
    and not exists (
      select 1 from public.guardians g
      where g.membership_id=v_recipient_membership_id
        and g.institution_id=new.institution_id
        and coalesce(g.receives_notifications,true)
    ) then
    return new;
  end if;

  if not coalesce((
    select np.in_app_enabled
    from public.notification_preferences np
    where np.institution_id=new.institution_id
      and np.membership_id=v_recipient_membership_id
      and np.notification_type='appointment'
  ),true) then
    return new;
  end if;

  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,
    title,body,resource_type,resource_id
  ) values (
    new.institution_id,
    v_recipient_membership_id,
    'appointment',
    v_title,
    left('Estado: '||v_status_label||'. Fecha: '||v_scheduled_label||'. Motivo: '||new.reason,500),
    'appointment',
    new.id
  )
  on conflict (
    institution_id,recipient_membership_id,notification_type,resource_type,resource_id
  )
  do update set
    title=excluded.title,
    body=excluded.body,
    created_at=now(),
    read_at=null;

  return new;
end;
$function$;

revoke all on function private.fanout_teacher_guardian_appointment_notification()
  from public,anon,authenticated;
drop trigger if exists teacher_guardian_appointments_fanout_notification
  on public.teacher_guardian_appointments;
create trigger teacher_guardian_appointments_fanout_notification
after insert or update of status on public.teacher_guardian_appointments
for each row execute function private.fanout_teacher_guardian_appointment_notification();

-- 6) Report-card fanout: only published workflows visible to that guardian.
create or replace function private.fanout_guardian_report_card_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status<>'published'
    or old.status is not distinct from 'published'
    or new.publication_audience not in ('guardian','both') then
    return new;
  end if;

  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,
    title,body,resource_type,resource_id
  )
  select distinct
    new.institution_id,
    gm.id,
    'report_card',
    'Nuevo boletín disponible',
    'Se publicó un boletín que podés consultar desde el portal familiar.',
    'report_card',
    new.id
  from public.student_guardians sg
  join public.guardians g
    on g.id=sg.guardian_id
    and g.institution_id=sg.institution_id
  join public.memberships gm
    on gm.id=g.membership_id
    and gm.institution_id=g.institution_id
    and gm.status='active'
  join public.membership_roles mr
    on mr.membership_id=gm.id
    and mr.institution_id=gm.institution_id
  join public.roles r
    on r.id=mr.role_id
    and r.key='guardian'
  where sg.student_id=new.student_id
    and sg.institution_id=new.institution_id
    and sg.can_view_report_cards=true
    and coalesce(g.receives_notifications,true)
    and coalesce((
      select np.in_app_enabled
      from public.notification_preferences np
      where np.institution_id=new.institution_id
        and np.membership_id=gm.id
        and np.notification_type='report_card'
    ),true)
  on conflict (
    institution_id,recipient_membership_id,notification_type,resource_type,resource_id
  ) do nothing;

  return new;
end;
$function$;

revoke all on function private.fanout_guardian_report_card_notification()
  from public,anon,authenticated;
drop trigger if exists report_card_fanout_guardian_notification
  on public.report_card_workflows;
create trigger report_card_fanout_guardian_notification
after update of status on public.report_card_workflows
for each row
when (new.status='published' and old.status is distinct from 'published')
execute function private.fanout_guardian_report_card_notification();

-- 7) Reassert recipient-only reads; message rows additionally require the
-- authenticated account to remain a valid participant under current scope.
drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read
on public.notifications for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.id=notifications.recipient_membership_id
      and m.institution_id=notifications.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
  and (
    notifications.notification_type<>'message'
    or private.has_current_conversation_access(
      notifications.institution_id,
      notifications.resource_id,
      notifications.recipient_membership_id
    )
  )
);
