create or replace function private.list_teacher_guardian_contacts_impl(p_division_id uuid)
returns table(student_id uuid,student_name text,guardian_membership_id uuid,guardian_name text)
language plpgsql stable security definer set search_path=''
as $function$
declare v_institution_id uuid; v_teacher_membership_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id,m.institution_id into v_teacher_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;
  if v_teacher_membership_id is null or not exists(
    select 1 from public.staff_assignments sa
    where sa.membership_id=v_teacher_membership_id and sa.institution_id=v_institution_id
      and sa.assignment_type='teacher'
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
      and (
        sa.division_id=p_division_id
        or (sa.division_id is null and exists(
          select 1 from public.divisions d
          join public.course_subjects cs on cs.course_id=d.course_id and cs.institution_id=d.institution_id
          where d.id=p_division_id and d.institution_id=v_institution_id and cs.id=sa.course_subject_id
        ))
      )
  ) then raise exception 'Teacher division access denied' using errcode='42501'; end if;
  return query
  select st.id,concat_ws(' ',st.last_name,st.first_name),gm.id,
    coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor')
  from public.enrollments e
  join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
  join public.student_guardians sg on sg.student_id=st.id and sg.institution_id=st.institution_id
  join public.guardians g on g.id=sg.guardian_id and g.institution_id=sg.institution_id
  join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id and gm.status='active'
  join public.profiles gp on gp.id=gm.user_id
  where e.institution_id=v_institution_id and e.division_id=p_division_id
    and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
    and st.status='active'
  order by st.last_name,st.first_name,gp.last_name,gp.first_name;
end;
$function$;

create or replace function private.create_teacher_guardian_appointment_impl(
  p_student_id uuid,p_guardian_membership_id uuid,p_scheduled_at timestamptz,p_reason text
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_teacher_membership_id uuid; v_division_id uuid; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_scheduled_at is null or p_scheduled_at<=now()
     or p_reason is null or length(btrim(p_reason))<3 or length(p_reason)>1000 then
    raise exception 'Invalid appointment details' using errcode='22023';
  end if;
  select m.id,m.institution_id into v_teacher_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;
  if v_teacher_membership_id is null then raise exception 'Teacher role required' using errcode='42501'; end if;
  select e.division_id into v_division_id
  from public.enrollments e
  join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
  where e.student_id=p_student_id and e.institution_id=v_institution_id and e.status='active'
    and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
    and st.status='active'
    and exists(select 1 from public.staff_assignments sa
      where sa.membership_id=v_teacher_membership_id and sa.institution_id=v_institution_id
        and sa.assignment_type='teacher'
        and (sa.starts_on is null or sa.starts_on<=current_date)
        and (sa.ends_on is null or sa.ends_on>=current_date)
        and (
          sa.division_id=e.division_id
          or (sa.division_id is null and exists(
            select 1 from public.divisions d
            join public.course_subjects cs on cs.course_id=d.course_id and cs.institution_id=d.institution_id
            where d.id=e.division_id and d.institution_id=v_institution_id and cs.id=sa.course_subject_id
          ))
        ))
  limit 1;
  if v_division_id is null or not exists(
    select 1 from public.guardians g
    join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
    join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id and gm.status='active'
    where sg.student_id=p_student_id and sg.institution_id=v_institution_id and gm.id=p_guardian_membership_id
  ) then raise exception 'Guardian is not linked to this student' using errcode='42501'; end if;
  insert into public.teacher_guardian_appointments(
    institution_id,division_id,student_id,teacher_membership_id,guardian_membership_id,scheduled_at,reason
  ) values(v_institution_id,v_division_id,p_student_id,v_teacher_membership_id,p_guardian_membership_id,p_scheduled_at,btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$function$;