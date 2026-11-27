-- Historical interview follow-up and final teacher observation.
alter table public.teacher_guardian_appointment_events
  drop constraint if exists teacher_guardian_appointment_events_event_type_check;
alter table public.teacher_guardian_appointment_events
  add constraint teacher_guardian_appointment_events_event_type_check
  check (event_type in (
    'guardian_confirmed','guardian_declined','teacher_accepted_proposal',
    'interview_completed','appointment_cancelled','teacher_final_observation'
  ));

create or replace function private.save_teacher_guardian_appointment_observation_impl(
  p_appointment_id uuid,p_observation text
) returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_observation is null or length(btrim(p_observation))<3 or length(p_observation)>1500 then
    raise exception 'Observation must contain between 3 and 1500 characters' using errcode='22023';
  end if;

  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;
  if v_membership_id is null then
    raise exception 'Active teacher membership required' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.teacher_guardian_appointments a
    where a.id=p_appointment_id and a.institution_id=v_institution_id
      and a.teacher_membership_id=v_membership_id and a.status='completed'
  ) then
    raise exception 'Only the assigned teacher can add a final observation to a completed interview' using errcode='42501';
  end if;

  if exists(
    select 1 from public.teacher_guardian_appointment_events ev
    where ev.appointment_id=p_appointment_id and ev.event_type='teacher_final_observation'
  ) then
    raise exception 'A final observation has already been recorded' using errcode='23505';
  end if;

  insert into public.teacher_guardian_appointment_events(
    institution_id,appointment_id,actor_membership_id,event_type,body
  ) values(v_institution_id,p_appointment_id,v_membership_id,'teacher_final_observation',btrim(p_observation));
  return true;
end;
$function$;

create or replace function public.save_teacher_guardian_appointment_observation(
  p_appointment_id uuid,p_observation text
) returns boolean
language sql
security invoker
set search_path=''
as $function$
  select private.save_teacher_guardian_appointment_observation_impl(p_appointment_id,p_observation);
$function$;

revoke all on function private.save_teacher_guardian_appointment_observation_impl(uuid,text) from public,anon;
grant execute on function private.save_teacher_guardian_appointment_observation_impl(uuid,text) to authenticated;
revoke all on function public.save_teacher_guardian_appointment_observation(uuid,text) from public,anon;
grant execute on function public.save_teacher_guardian_appointment_observation(uuid,text) to authenticated;

-- Notify the tutor when the assigned teacher records the final interview summary.
create or replace function private.notify_teacher_guardian_final_observation()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_title text := 'El docente registró la observación final'; v_body text;
begin
  if new.event_type <> 'teacher_final_observation' then return new; end if;
  v_body := left('Ya está disponible el seguimiento de la entrevista: '||new.body,500);
  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  )
  select new.institution_id,a.guardian_membership_id,'appointment',v_title,v_body,'appointment',new.appointment_id
  from public.teacher_guardian_appointments a
  where a.id=new.appointment_id and a.institution_id=new.institution_id
    and coalesce((
      select np.in_app_enabled from public.notification_preferences np
      where np.institution_id=new.institution_id
        and np.membership_id=a.guardian_membership_id
        and np.notification_type='appointment'
    ),true)
  on conflict do nothing;
  return new;
end;
$function$;

revoke all on function private.notify_teacher_guardian_final_observation() from public,anon,authenticated;
drop trigger if exists teacher_guardian_final_observation_notify on public.teacher_guardian_appointment_events;
create trigger teacher_guardian_final_observation_notify
after insert on public.teacher_guardian_appointment_events
for each row execute function private.notify_teacher_guardian_final_observation();
