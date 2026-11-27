-- Automatic appointment notifications integrated with the existing in-app inbox.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in ('announcement','message','grade','attendance','support','appointment'));

alter table public.notifications
  drop constraint if exists notifications_resource_type_check;
alter table public.notifications
  add constraint notifications_resource_type_check
  check (resource_type in ('announcement','conversation','grade','attendance','support_ticket','appointment'));

alter table public.notification_preferences
  drop constraint if exists notification_preferences_notification_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_notification_type_check
  check (notification_type in ('announcement','message','grade','attendance','support','appointment'));

create or replace function private.notify_new_teacher_guardian_appointment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  )
  select new.institution_id,new.guardian_membership_id,'appointment',
    'Nueva citación para entrevista',
    left('Se solicitó una entrevista por el siguiente motivo: '||new.reason||'. Fecha propuesta: '||
      to_char(new.scheduled_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI')||'.',500),
    'appointment',new.id
  where coalesce((
    select np.in_app_enabled from public.notification_preferences np
    where np.institution_id=new.institution_id
      and np.membership_id=new.guardian_membership_id
      and np.notification_type='appointment'
  ),true)
  on conflict (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
  do nothing;
  return new;
end;
$function$;

revoke all on function private.notify_new_teacher_guardian_appointment() from public,anon,authenticated;
drop trigger if exists teacher_guardian_appointment_notify_insert on public.teacher_guardian_appointments;
create trigger teacher_guardian_appointment_notify_insert
after insert on public.teacher_guardian_appointments
for each row execute function private.notify_new_teacher_guardian_appointment();

create or replace function private.notify_teacher_guardian_appointment_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_recipient_membership_id uuid;
  v_title text;
  v_body text;
begin
  select case
      when new.actor_membership_id=a.guardian_membership_id then a.teacher_membership_id
      when new.actor_membership_id=a.teacher_membership_id then a.guardian_membership_id
      else null
    end,
    case new.event_type
      when 'guardian_confirmed' then 'El tutor confirmó la entrevista'
      when 'guardian_declined' then 'El tutor respondió la citación'
      when 'teacher_accepted_proposal' then 'El docente aceptó el horario alternativo'
      else null
    end,
    case new.event_type
      when 'guardian_confirmed' then 'La entrevista quedó confirmada para el '||
        to_char(a.scheduled_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI')||'.'
      when 'guardian_declined' then 'El tutor indicó que no puede asistir.'||
        case when new.proposed_at is not null then ' Propuso: '||
          to_char(new.proposed_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI')||'.' else '' end||
        case when new.body is not null then ' Mensaje: '||new.body else '' end
      when 'teacher_accepted_proposal' then 'El docente aceptó la fecha alternativa '||
        coalesce(to_char(new.proposed_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI'),'')||
        ' y envió nuevamente la citación para confirmar.'
      else null
    end
  into v_recipient_membership_id,v_title,v_body
  from public.teacher_guardian_appointments a
  where a.id=new.appointment_id and a.institution_id=new.institution_id;

  if v_recipient_membership_id is not null and v_title is not null then
    insert into public.notifications(
      institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
    )
    select new.institution_id,v_recipient_membership_id,'appointment',v_title,left(coalesce(v_body,''),500),
      'appointment',new.id
    where coalesce((
      select np.in_app_enabled from public.notification_preferences np
      where np.institution_id=new.institution_id
        and np.membership_id=v_recipient_membership_id
        and np.notification_type='appointment'
    ),true)
    on conflict (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
    do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function private.notify_teacher_guardian_appointment_event() from public,anon,authenticated;
drop trigger if exists teacher_guardian_appointment_event_notify on public.teacher_guardian_appointment_events;
create trigger teacher_guardian_appointment_event_notify
after insert on public.teacher_guardian_appointment_events
for each row execute function private.notify_teacher_guardian_appointment_event();

create or replace function private.notify_teacher_guardian_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_title text; v_body text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status='completed' then
    v_title := 'Entrevista marcada como realizada';
    v_body := 'El docente registró como realizada la entrevista del '||
      to_char(new.scheduled_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI')||'.';
  elsif new.status='cancelled' then
    v_title := 'Citación cancelada';
    v_body := 'El docente canceló la citación prevista para el '||
      to_char(new.scheduled_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI')||'.';
  else
    return new;
  end if;

  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  )
  select new.institution_id,new.guardian_membership_id,'appointment',v_title,left(v_body,500),
    'appointment',gen_random_uuid()
  where coalesce((
    select np.in_app_enabled from public.notification_preferences np
    where np.institution_id=new.institution_id
      and np.membership_id=new.guardian_membership_id
      and np.notification_type='appointment'
  ),true);
  return new;
end;
$function$;

revoke all on function private.notify_teacher_guardian_appointment_status_change() from public,anon,authenticated;
drop trigger if exists teacher_guardian_appointment_status_notify on public.teacher_guardian_appointments;
create trigger teacher_guardian_appointment_status_notify
after update of status on public.teacher_guardian_appointments
for each row execute function private.notify_teacher_guardian_appointment_status_change();

create or replace function private.update_teacher_guardian_appointment_impl(
  p_appointment_id uuid,p_status text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_updated integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_status not in ('completed','cancelled') then
    raise exception 'Invalid appointment status' using errcode='22023';
  end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;
  if v_membership_id is null then raise exception 'Active teacher membership required' using errcode='42501'; end if;

  update public.teacher_guardian_appointments a
  set status=p_status,updated_at=now()
  where a.id=p_appointment_id and a.institution_id=v_institution_id
    and a.teacher_membership_id=v_membership_id
    and ((p_status='completed' and a.status='confirmed')
      or (p_status='cancelled' and a.status in ('requested','confirmed')));
  get diagnostics v_updated=row_count;
  if v_updated=0 then raise exception 'Appointment not found or invalid status transition' using errcode='42501'; end if;

  insert into public.teacher_guardian_appointment_events(
    institution_id,appointment_id,actor_membership_id,event_type,body
  ) values (
    v_institution_id,p_appointment_id,v_membership_id,
    case when p_status='completed' then 'interview_completed' else 'appointment_cancelled' end,
    case when p_status='completed' then 'El docente registró la entrevista como realizada.'
      else 'El docente canceló la citación.' end
  );
  return true;
end;
$function$;
