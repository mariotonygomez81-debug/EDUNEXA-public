alter table public.teacher_guardian_appointments
  alter column teacher_membership_id drop not null,
  add column if not exists prefect_membership_id uuid references public.memberships(id) on delete restrict;

alter table public.teacher_guardian_appointments
  drop constraint if exists teacher_guardian_appointments_single_responsible_check;
alter table public.teacher_guardian_appointments
  add constraint teacher_guardian_appointments_single_responsible_check
  check ((teacher_membership_id is not null and prefect_membership_id is null)
      or (teacher_membership_id is null and prefect_membership_id is not null));

create index if not exists teacher_guardian_appointments_prefect_date_idx
  on public.teacher_guardian_appointments(prefect_membership_id,scheduled_at desc)
  where prefect_membership_id is not null;

create or replace function private.list_prefect_guardian_contacts_impl(p_division_id uuid)
returns table(student_id uuid,student_name text,guardian_membership_id uuid,guardian_name text)
language plpgsql stable security definer set search_path=''
as $function$
declare v_institution_id uuid; v_prefect_membership_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id,m.institution_id into v_prefect_membership_id,v_institution_id
  from public.memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='prefect' limit 1;
  if v_prefect_membership_id is null or not exists(
    select 1 from public.staff_assignments sa where sa.membership_id=v_prefect_membership_id
      and sa.institution_id=v_institution_id and sa.assignment_type='prefect' and sa.division_id=p_division_id
      and (sa.starts_on is null or sa.starts_on<=current_date) and (sa.ends_on is null or sa.ends_on>=current_date)
  ) then raise exception 'Prefect division access denied' using errcode='42501'; end if;
  return query
  select st.id,concat_ws(' ',st.last_name,st.first_name),gm.id,
    coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor')
  from public.enrollments e join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
  join public.student_guardians sg on sg.student_id=st.id and sg.institution_id=st.institution_id
  join public.guardians g on g.id=sg.guardian_id and g.institution_id=sg.institution_id
  join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id and gm.status='active'
  join public.profiles gp on gp.id=gm.user_id
  where e.institution_id=v_institution_id and e.division_id=p_division_id and e.status='active'
    and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date) and st.status='active'
  order by st.last_name,st.first_name,gp.last_name,gp.first_name;
end;
$function$;

create or replace function private.create_prefect_guardian_appointment_impl(
  p_student_id uuid,p_guardian_membership_id uuid,p_scheduled_at timestamptz,p_reason text
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_prefect_membership_id uuid; v_division_id uuid; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_scheduled_at is null or p_scheduled_at<=now() or p_reason is null
    or length(btrim(p_reason))<3 or length(p_reason)>1000 then
    raise exception 'Invalid appointment details' using errcode='22023';
  end if;
  select m.id,m.institution_id into v_prefect_membership_id,v_institution_id
  from public.memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='prefect' limit 1;
  if v_prefect_membership_id is null then raise exception 'Prefect role required' using errcode='42501'; end if;
  select e.division_id into v_division_id
  from public.enrollments e join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
  where e.student_id=p_student_id and e.institution_id=v_institution_id and e.status='active'
    and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date) and st.status='active'
    and exists(select 1 from public.staff_assignments sa where sa.membership_id=v_prefect_membership_id
      and sa.institution_id=v_institution_id and sa.assignment_type='prefect' and sa.division_id=e.division_id
      and (sa.starts_on is null or sa.starts_on<=current_date) and (sa.ends_on is null or sa.ends_on>=current_date))
  limit 1;
  if v_division_id is null or not exists(
    select 1 from public.guardians g join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
    join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id and gm.status='active'
    where sg.student_id=p_student_id and sg.institution_id=v_institution_id and gm.id=p_guardian_membership_id
  ) then raise exception 'Guardian is not linked to this student or division' using errcode='42501'; end if;
  insert into public.teacher_guardian_appointments(
    institution_id,division_id,student_id,teacher_membership_id,prefect_membership_id,
    guardian_membership_id,scheduled_at,reason
  ) values(v_institution_id,v_division_id,p_student_id,null,v_prefect_membership_id,
    p_guardian_membership_id,p_scheduled_at,btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function private.list_prefect_guardian_appointments_impl()
returns table(appointment_id uuid,student_id uuid,student_name text,guardian_name text,
  scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='prefect' limit 1;
  if v_membership_id is null then raise exception 'Active prefect membership required' using errcode='42501'; end if;
  return query
  select a.id,a.student_id,concat_ws(' ',st.last_name,st.first_name),
    coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor'),
    a.scheduled_at,a.reason,a.status,a.created_at,a.updated_at
  from public.teacher_guardian_appointments a
  join public.students st on st.id=a.student_id and st.institution_id=a.institution_id
  join public.memberships gm on gm.id=a.guardian_membership_id and gm.institution_id=a.institution_id and gm.status='active'
  join public.profiles gp on gp.id=gm.user_id
  where a.institution_id=v_institution_id and a.prefect_membership_id=v_membership_id
  order by a.scheduled_at desc;
end;
$function$;

create or replace function private.update_prefect_guardian_appointment_impl(p_appointment_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_updated integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_status not in ('completed','cancelled') then raise exception 'Invalid appointment status' using errcode='22023'; end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='prefect' limit 1;
  if v_membership_id is null then raise exception 'Active prefect membership required' using errcode='42501'; end if;
  update public.teacher_guardian_appointments a set status=p_status,updated_at=now()
  where a.id=p_appointment_id and a.institution_id=v_institution_id and a.prefect_membership_id=v_membership_id
    and ((p_status='completed' and a.status='confirmed') or (p_status='cancelled' and a.status in ('requested','confirmed')));
  get diagnostics v_updated=row_count;
  if v_updated=0 then raise exception 'Appointment not found or invalid status transition' using errcode='42501'; end if;
  return true;
end;
$function$;

create or replace function private.list_guardian_teacher_appointments_impl()
returns table(appointment_id uuid,student_id uuid,student_name text,teacher_name text,
  scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='guardian' limit 1;
  if v_membership_id is null then raise exception 'Active guardian membership required' using errcode='42501'; end if;
  return query
  select a.id,a.student_id,concat_ws(' ',st.last_name,st.first_name),
    case when a.prefect_membership_id is not null then
      coalesce(nullif(btrim(pp.display_name),''),concat_ws(' ',pp.first_name,pp.last_name),'Preceptor')
    else coalesce(nullif(btrim(tp.display_name),''),concat_ws(' ',tp.first_name,tp.last_name),'Docente') end,
    a.scheduled_at,a.reason,a.status,a.created_at,a.updated_at
  from public.teacher_guardian_appointments a
  join public.students st on st.id=a.student_id and st.institution_id=a.institution_id
  join public.student_guardians sg on sg.student_id=st.id and sg.institution_id=st.institution_id
  join public.guardians g on g.id=sg.guardian_id and g.institution_id=sg.institution_id
  join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id
    and gm.id=a.guardian_membership_id and gm.status='active'
  left join public.memberships tm on tm.id=a.teacher_membership_id and tm.institution_id=a.institution_id
  left join public.profiles tp on tp.id=tm.user_id
  left join public.memberships pm on pm.id=a.prefect_membership_id and pm.institution_id=a.institution_id
  left join public.profiles pp on pp.id=pm.user_id
  where a.institution_id=v_institution_id and a.guardian_membership_id=v_membership_id
  order by a.scheduled_at desc;
end;
$function$;

create or replace function public.list_prefect_guardian_contacts(p_division_id uuid)
returns table(student_id uuid,student_name text,guardian_membership_id uuid,guardian_name text)
language sql stable security invoker set search_path=''
as $function$ select * from private.list_prefect_guardian_contacts_impl(p_division_id); $function$;
create or replace function public.create_prefect_guardian_appointment(p_student_id uuid,p_guardian_membership_id uuid,p_scheduled_at timestamptz,p_reason text)
returns uuid language sql security invoker set search_path=''
as $function$ select private.create_prefect_guardian_appointment_impl(p_student_id,p_guardian_membership_id,p_scheduled_at,p_reason); $function$;
create or replace function public.list_prefect_guardian_appointments()
returns table(appointment_id uuid,student_id uuid,student_name text,guardian_name text,
  scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz)
language sql stable security invoker set search_path=''
as $function$ select * from private.list_prefect_guardian_appointments_impl(); $function$;
create or replace function public.update_prefect_guardian_appointment(p_appointment_id uuid,p_status text)
returns boolean language sql security invoker set search_path=''
as $function$ select private.update_prefect_guardian_appointment_impl(p_appointment_id,p_status); $function$;

revoke all on function public.list_prefect_guardian_contacts(uuid) from public,anon;
revoke all on function public.create_prefect_guardian_appointment(uuid,uuid,timestamptz,text) from public,anon;
revoke all on function public.list_prefect_guardian_appointments() from public,anon;
revoke all on function public.update_prefect_guardian_appointment(uuid,text) from public,anon;
grant execute on function public.list_prefect_guardian_contacts(uuid) to authenticated;
grant execute on function public.create_prefect_guardian_appointment(uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.list_prefect_guardian_appointments() to authenticated;
grant execute on function public.update_prefect_guardian_appointment(uuid,text) to authenticated;

revoke all on function private.list_prefect_guardian_contacts_impl(uuid) from public,anon;
revoke all on function private.create_prefect_guardian_appointment_impl(uuid,uuid,timestamptz,text) from public,anon;
revoke all on function private.list_prefect_guardian_appointments_impl() from public,anon;
revoke all on function private.update_prefect_guardian_appointment_impl(uuid,text) from public,anon;
revoke all on function private.list_guardian_teacher_appointments_impl() from public,anon;
grant execute on function private.list_prefect_guardian_contacts_impl(uuid) to authenticated;
grant execute on function private.create_prefect_guardian_appointment_impl(uuid,uuid,timestamptz,text) to authenticated;
grant execute on function private.list_prefect_guardian_appointments_impl() to authenticated;
grant execute on function private.update_prefect_guardian_appointment_impl(uuid,text) to authenticated;
grant execute on function private.list_guardian_teacher_appointments_impl() to authenticated;
