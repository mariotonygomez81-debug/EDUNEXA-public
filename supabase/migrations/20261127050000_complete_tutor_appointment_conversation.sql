-- Complete the family/teacher appointment conversation and rescheduling loop.
alter table public.teacher_guardian_appointments
  add column if not exists guardian_proposed_at timestamptz;

create table if not exists public.teacher_guardian_appointment_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  appointment_id uuid not null references public.teacher_guardian_appointments(id) on delete cascade,
  actor_membership_id uuid not null references public.memberships(id) on delete restrict,
  event_type text not null check (event_type in ('guardian_confirmed','guardian_declined','teacher_accepted_proposal','interview_completed','appointment_cancelled')),
  body text,
  proposed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint teacher_guardian_appointment_events_body_length check (body is null or length(body)<=500)
);
create index if not exists teacher_guardian_appointment_events_timeline_idx
  on public.teacher_guardian_appointment_events(appointment_id,created_at,id);
alter table public.teacher_guardian_appointment_events enable row level security;
revoke all on public.teacher_guardian_appointment_events from public,anon,authenticated;

create or replace function private.respond_teacher_guardian_appointment_with_details_impl(
  p_appointment_id uuid,p_response text,p_note text,p_proposed_at timestamptz
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_rows integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_response not in ('confirmed','rejected') or coalesce(length(p_note),0)>500
    or (p_proposed_at is not null and (p_response<>'rejected' or p_proposed_at<=now())) then
    raise exception 'Invalid appointment response' using errcode='22023';
  end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='guardian'
  limit 1;
  if v_membership_id is null then raise exception 'Active guardian membership required' using errcode='42501'; end if;

  update public.teacher_guardian_appointments a
  set status=p_response,guardian_response_at=now(),
      guardian_response_note=nullif(btrim(p_note),''),
      guardian_proposed_at=p_proposed_at,updated_at=now()
  where a.id=p_appointment_id and a.institution_id=v_institution_id
    and a.guardian_membership_id=v_membership_id and a.status='requested'
    and exists(select 1 from public.student_guardians sg
      join public.guardians g on g.id=sg.guardian_id and g.institution_id=sg.institution_id
      where sg.student_id=a.student_id and sg.institution_id=a.institution_id
        and g.membership_id=v_membership_id);
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception 'Appointment not found or no longer awaiting response' using errcode='42501'; end if;

  insert into public.teacher_guardian_appointment_events(
    institution_id,appointment_id,actor_membership_id,event_type,body,proposed_at
  ) values (
    v_institution_id,p_appointment_id,v_membership_id,
    case when p_response='confirmed' then 'guardian_confirmed' else 'guardian_declined' end,
    nullif(btrim(p_note),''),p_proposed_at
  );
  return true;
end;
$function$;

create or replace function private.accept_teacher_guardian_appointment_proposal_impl(p_appointment_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_proposed_at timestamptz; v_rows integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;
  if v_membership_id is null then raise exception 'Active teacher membership required' using errcode='42501'; end if;

  select a.guardian_proposed_at into v_proposed_at
  from public.teacher_guardian_appointments a
  where a.id=p_appointment_id and a.institution_id=v_institution_id
    and a.teacher_membership_id=v_membership_id and a.status='rejected'
    and a.guardian_proposed_at>now()
  for update;
  if v_proposed_at is null then raise exception 'No current alternative time proposal' using errcode='42501'; end if;

  update public.teacher_guardian_appointments
  set scheduled_at=v_proposed_at,status='requested',guardian_response_at=null,
      guardian_response_note=null,guardian_proposed_at=null,updated_at=now()
  where id=p_appointment_id and institution_id=v_institution_id
    and teacher_membership_id=v_membership_id and status='rejected';

  insert into public.teacher_guardian_appointment_events(
    institution_id,appointment_id,actor_membership_id,event_type,body,proposed_at
  ) values(v_institution_id,p_appointment_id,v_membership_id,'teacher_accepted_proposal',
    'El docente aceptó el horario alternativo. La citación fue reenviada para confirmación.',v_proposed_at);
  return true;
end;
$function$;

create or replace function private.list_my_teacher_guardian_appointment_details_impl()
returns table(
  appointment_id uuid,student_id uuid,student_name text,teacher_name text,guardian_name text,
  scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz,
  guardian_response_note text,guardian_proposed_at timestamptz,conversation jsonb
)
language plpgsql stable security definer set search_path=''
as $function$
declare v_user_id uuid := (select auth.uid()); v_membership_id uuid; v_institution_id uuid; v_role text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id,m.institution_id,r.key into v_membership_id,v_institution_id,v_role
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=v_user_id and m.status='active' and r.key in ('teacher','guardian')
  order by case when r.key='guardian' then 0 else 1 end
  limit 1;
  if v_membership_id is null then raise exception 'Active teacher or guardian membership required' using errcode='42501'; end if;

  return query
  select a.id,a.student_id,concat_ws(' ',st.last_name,st.first_name),
    coalesce(nullif(btrim(tp.display_name),''),concat_ws(' ',tp.first_name,tp.last_name),'Docente'),
    coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor'),
    a.scheduled_at,a.reason,a.status,a.created_at,a.updated_at,
    a.guardian_response_note,a.guardian_proposed_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',ev.id,'event_type',ev.event_type,'body',ev.body,'proposed_at',ev.proposed_at,
      'created_at',ev.created_at,'actor_name',
      coalesce(nullif(btrim(ap.display_name),''),concat_ws(' ',ap.first_name,ap.last_name),'Usuario')
    ) order by ev.created_at,ev.id)
    from public.teacher_guardian_appointment_events ev
    join public.memberships em on em.id=ev.actor_membership_id and em.institution_id=ev.institution_id
    join public.profiles ap on ap.id=em.user_id
    where ev.appointment_id=a.id), '[]'::jsonb)
  from public.teacher_guardian_appointments a
  join public.students st on st.id=a.student_id and st.institution_id=a.institution_id
  join public.memberships tm on tm.id=a.teacher_membership_id and tm.institution_id=a.institution_id
  join public.profiles tp on tp.id=tm.user_id
  join public.memberships gm on gm.id=a.guardian_membership_id and gm.institution_id=a.institution_id
  join public.profiles gp on gp.id=gm.user_id
  where a.institution_id=v_institution_id
    and ((v_role='teacher' and a.teacher_membership_id=v_membership_id)
      or (v_role='guardian' and a.guardian_membership_id=v_membership_id))
  order by a.scheduled_at desc,a.created_at desc;
end;
$function$;

create or replace function public.respond_teacher_guardian_appointment_with_details(
  p_appointment_id uuid,p_response text,p_note text default null,p_proposed_at timestamptz default null
) returns boolean language sql security invoker set search_path=''
as $function$ select private.respond_teacher_guardian_appointment_with_details_impl(p_appointment_id,p_response,p_note,p_proposed_at); $function$;
create or replace function public.accept_teacher_guardian_appointment_proposal(p_appointment_id uuid)
returns boolean language sql security invoker set search_path=''
as $function$ select private.accept_teacher_guardian_appointment_proposal_impl(p_appointment_id); $function$;
create or replace function public.list_my_teacher_guardian_appointment_details()
returns table(
  appointment_id uuid,student_id uuid,student_name text,teacher_name text,guardian_name text,
  scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz,
  guardian_response_note text,guardian_proposed_at timestamptz,conversation jsonb
) language sql stable security invoker set search_path=''
as $function$ select * from private.list_my_teacher_guardian_appointment_details_impl(); $function$;

revoke all on function private.respond_teacher_guardian_appointment_with_details_impl(uuid,text,text,timestamptz) from public,anon;
revoke all on function private.accept_teacher_guardian_appointment_proposal_impl(uuid) from public,anon;
revoke all on function private.list_my_teacher_guardian_appointment_details_impl() from public,anon;
grant execute on function private.respond_teacher_guardian_appointment_with_details_impl(uuid,text,text,timestamptz) to authenticated;
grant execute on function private.accept_teacher_guardian_appointment_proposal_impl(uuid) to authenticated;
grant execute on function private.list_my_teacher_guardian_appointment_details_impl() to authenticated;
revoke all on function public.respond_teacher_guardian_appointment_with_details(uuid,text,text,timestamptz) from public,anon;
revoke all on function public.accept_teacher_guardian_appointment_proposal(uuid) from public,anon;
revoke all on function public.list_my_teacher_guardian_appointment_details() from public,anon;
grant execute on function public.respond_teacher_guardian_appointment_with_details(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.accept_teacher_guardian_appointment_proposal(uuid) to authenticated;
grant execute on function public.list_my_teacher_guardian_appointment_details() to authenticated;
