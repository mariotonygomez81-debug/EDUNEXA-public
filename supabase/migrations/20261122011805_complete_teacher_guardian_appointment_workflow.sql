alter table public.teacher_guardian_appointments
  drop constraint if exists teacher_guardian_appointments_status_check;
alter table public.teacher_guardian_appointments
  add constraint teacher_guardian_appointments_status_check
  check (status in ('requested','confirmed','rejected','declined','completed','cancelled'));

create or replace function private.list_guardian_teacher_appointments_impl()
returns table(
  appointment_id uuid,
  student_id uuid,
  student_name text,
  teacher_name text,
  scheduled_at timestamptz,
  reason text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_institution_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr
    on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='guardian'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active guardian membership required' using errcode='42501';
  end if;

  return query
  select a.id,a.student_id,concat_ws(' ',st.last_name,st.first_name),
    coalesce(nullif(btrim(tp.display_name),''),concat_ws(' ',tp.first_name,tp.last_name),'Docente'),
    a.scheduled_at,a.reason,a.status,a.created_at,a.updated_at
  from public.teacher_guardian_appointments a
  join public.students st on st.id=a.student_id and st.institution_id=a.institution_id
  join public.student_guardians sg on sg.student_id=st.id and sg.institution_id=st.institution_id
  join public.guardians g on g.id=sg.guardian_id and g.institution_id=sg.institution_id
  join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id
    and gm.id=a.guardian_membership_id and gm.status='active'
  join public.memberships tm on tm.id=a.teacher_membership_id and tm.institution_id=a.institution_id
  join public.profiles tp on tp.id=tm.user_id
  where a.institution_id=v_institution_id and a.guardian_membership_id=v_membership_id
  order by a.scheduled_at desc;
end;
$function$;

create or replace function private.list_teacher_guardian_appointments_impl()
returns table(
  appointment_id uuid,
  student_id uuid,
  student_name text,
  guardian_name text,
  scheduled_at timestamptz,
  reason text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_institution_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr
    on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active teacher membership required' using errcode='42501';
  end if;

  return query
  select a.id,a.student_id,concat_ws(' ',st.last_name,st.first_name),
    coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor'),
    a.scheduled_at,a.reason,a.status,a.created_at,a.updated_at
  from public.teacher_guardian_appointments a
  join public.students st on st.id=a.student_id and st.institution_id=a.institution_id
  join public.memberships gm on gm.id=a.guardian_membership_id
    and gm.institution_id=a.institution_id and gm.status='active'
  join public.profiles gp on gp.id=gm.user_id
  where a.institution_id=v_institution_id and a.teacher_membership_id=v_membership_id
  order by a.scheduled_at desc;
end;
$function$;

create or replace function private.respond_teacher_guardian_appointment_impl(
  p_appointment_id uuid,p_response text
)
returns boolean
language plpgsql security definer set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_institution_id uuid;
  v_updated integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_response not in ('confirmed','rejected') then
    raise exception 'Invalid appointment response' using errcode='22023';
  end if;

  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr
    on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='guardian'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active guardian membership required' using errcode='42501';
  end if;

  update public.teacher_guardian_appointments a
  set status=p_response,updated_at=now()
  where a.id=p_appointment_id and a.institution_id=v_institution_id
    and a.guardian_membership_id=v_membership_id and a.status='requested'
    and exists(
      select 1 from public.student_guardians sg
      join public.guardians g on g.id=sg.guardian_id and g.institution_id=sg.institution_id
      where sg.student_id=a.student_id and sg.institution_id=a.institution_id
        and g.membership_id=v_membership_id
    );
  get diagnostics v_updated=row_count;
  if v_updated=0 then
    raise exception 'Appointment not found or no longer awaiting response' using errcode='42501';
  end if;
  return true;
end;
$function$;

create or replace function private.update_teacher_guardian_appointment_impl(
  p_appointment_id uuid,p_status text
)
returns boolean
language plpgsql security definer set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_institution_id uuid;
  v_updated integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_status not in ('completed','cancelled') then
    raise exception 'Invalid appointment status' using errcode='22023';
  end if;

  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr
    on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active teacher membership required' using errcode='42501';
  end if;

  update public.teacher_guardian_appointments a
  set status=p_status,updated_at=now()
  where a.id=p_appointment_id and a.institution_id=v_institution_id
    and a.teacher_membership_id=v_membership_id
    and (
      (p_status='completed' and a.status='confirmed')
      or (p_status='cancelled' and a.status in ('requested','confirmed'))
    );
  get diagnostics v_updated=row_count;
  if v_updated=0 then
    raise exception 'Appointment not found or invalid status transition' using errcode='42501';
  end if;
  return true;
end;
$function$;

create or replace function public.list_guardian_teacher_appointments()
returns table(
  appointment_id uuid,student_id uuid,student_name text,teacher_name text,
  scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz
)
language sql stable security invoker set search_path=''
as $function$ select * from private.list_guardian_teacher_appointments_impl(); $function$;

create or replace function public.list_teacher_guardian_appointments()
returns table(
  appointment_id uuid,student_id uuid,student_name text,guardian_name text,
  scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz
)
language sql stable security invoker set search_path=''
as $function$ select * from private.list_teacher_guardian_appointments_impl(); $function$;

create or replace function public.respond_teacher_guardian_appointment(
  p_appointment_id uuid,p_response text
)
returns boolean
language sql security invoker set search_path=''
as $function$ select private.respond_teacher_guardian_appointment_impl(p_appointment_id,p_response); $function$;

create or replace function public.update_teacher_guardian_appointment(
  p_appointment_id uuid,p_status text
)
returns boolean
language sql security invoker set search_path=''
as $function$ select private.update_teacher_guardian_appointment_impl(p_appointment_id,p_status); $function$;

revoke all on function public.list_guardian_teacher_appointments() from public,anon;
revoke all on function public.list_teacher_guardian_appointments() from public,anon;
revoke all on function public.respond_teacher_guardian_appointment(uuid,text) from public,anon;
revoke all on function public.update_teacher_guardian_appointment(uuid,text) from public,anon;
grant execute on function public.list_guardian_teacher_appointments() to authenticated;
grant execute on function public.list_teacher_guardian_appointments() to authenticated;
grant execute on function public.respond_teacher_guardian_appointment(uuid,text) to authenticated;
grant execute on function public.update_teacher_guardian_appointment(uuid,text) to authenticated;
