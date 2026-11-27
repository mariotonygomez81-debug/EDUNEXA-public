CREATE OR REPLACE FUNCTION private.list_my_portal_students_impl(p_institution_id uuid)
 RETURNS TABLE(student_id uuid, first_name text, last_name text, student_number text, is_self boolean, division_id uuid, division_name text, course_name text, academic_year_id uuid, academic_year_name text, enrollment_status text, can_view_grades boolean, can_view_attendance boolean, attendance_present integer, attendance_absent integer, attendance_late integer, attendance_justified integer, attendance_early_departure integer, attendance_total integer, last_attendance_on date, published_report_card_count integer, latest_report_card_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
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

  if not exists (
    select 1
    from public.membership_roles mr
    join public.roles r on r.id=mr.role_id
    where mr.membership_id=v_membership_id
      and mr.institution_id=p_institution_id
      and r.key in ('student','guardian')
  ) then
    raise exception 'Student or guardian profile required' using errcode='42501';
  end if;

  return query
  with my_students as (
    select sm.student_id,true as is_self
    from public.student_memberships sm
    where sm.membership_id=v_membership_id
      and sm.institution_id=p_institution_id
    union all
    select sg.student_id,false as is_self
    from public.guardians g
    join public.student_guardians sg
      on sg.guardian_id=g.id and sg.institution_id=g.institution_id
    where g.membership_id=v_membership_id
      and g.institution_id=p_institution_id
  ),
  unique_students as (
    select ms.student_id,bool_or(ms.is_self) as is_self
    from my_students ms
    group by ms.student_id
  )
  select
    st.id,
    st.first_name,
    st.last_name,
    st.student_number,
    us.is_self,
    enrollment.division_id,
    enrollment.division_name,
    enrollment.course_name,
    enrollment.academic_year_id,
    enrollment.academic_year_name,
    case when enrollment.division_id is null then 'without_active_enrollment' else 'active' end,
    private.can_access_student(st.id,p_institution_id,'grades.read'),
    private.can_access_student(st.id,p_institution_id,'attendance.read'),
    case when private.can_access_student(st.id,p_institution_id,'attendance.read')
      then coalesce(attendance.present_count,0) else 0 end,
    case when private.can_access_student(st.id,p_institution_id,'attendance.read')
      then coalesce(attendance.absent_count,0) else 0 end,
    case when private.can_access_student(st.id,p_institution_id,'attendance.read')
      then coalesce(attendance.late_count,0) else 0 end,
    case when private.can_access_student(st.id,p_institution_id,'attendance.read')
      then coalesce(attendance.justified_count,0) else 0 end,
    case when private.can_access_student(st.id,p_institution_id,'attendance.read')
      then coalesce(attendance.early_departure_count,0) else 0 end,
    case when private.can_access_student(st.id,p_institution_id,'attendance.read')
      then coalesce(attendance.total_count,0) else 0 end,
    case when private.can_access_student(st.id,p_institution_id,'attendance.read')
      then attendance.last_attendance_on else null end,
    case when private.can_access_student(st.id,p_institution_id,'grades.read')
      then coalesce(report_cards.published_count,0) else 0 end,
    case when private.can_access_student(st.id,p_institution_id,'grades.read')
      then report_cards.latest_published_at else null end
  from unique_students us
  join public.students st
    on st.id=us.student_id and st.institution_id=p_institution_id
  left join lateral (
    select
      e.division_id,
      d.name as division_name,
      c.name as course_name,
      ay.id as academic_year_id,
      ay.name as academic_year_name
    from public.enrollments e
    join public.divisions d
      on d.id=e.division_id and d.institution_id=e.institution_id
    join public.courses c
      on c.id=d.course_id and c.institution_id=d.institution_id
    left join public.academic_years ay
      on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
    where e.student_id=st.id
      and e.institution_id=p_institution_id
      and e.status='active'
      and e.enrolled_on<=current_date
      and (e.ended_on is null or e.ended_on>=current_date)
    order by e.enrolled_on desc
    limit 1
  ) enrollment on true
  left join lateral (
    select
      count(*) filter (where ar.status='present')::integer as present_count,
      count(*) filter (where ar.status='absent')::integer as absent_count,
      count(*) filter (where ar.status='late')::integer as late_count,
      count(*) filter (where ar.status='justified')::integer as justified_count,
      count(*) filter (where ar.status='early_departure')::integer as early_departure_count,
      count(*)::integer as total_count,
      max(s.held_on) as last_attendance_on
    from public.attendance_records ar
    join public.attendance_sessions s
      on s.id=ar.session_id and s.institution_id=ar.institution_id
    where ar.student_id=st.id
      and ar.institution_id=p_institution_id
      and s.status in ('submitted','locked')
      and (enrollment.academic_year_id is null or s.held_on between
        (select ay.starts_on from public.academic_years ay where ay.id=enrollment.academic_year_id)
        and (select ay.ends_on from public.academic_years ay where ay.id=enrollment.academic_year_id))
  ) attendance on private.can_access_student(st.id,p_institution_id,'attendance.read')
  left join lateral (
    select count(*)::integer as published_count,max(w.published_at) as latest_published_at
    from public.report_card_workflows w
    where w.institution_id=p_institution_id
      and w.student_id=st.id
      and w.status='published'
  ) report_cards on private.can_access_student(st.id,p_institution_id,'grades.read')
  order by st.last_name,st.first_name;
end;
$function$


CREATE OR REPLACE FUNCTION private.list_my_student_attendance_impl(p_institution_id uuid, p_student_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(session_id uuid, held_on date, period_label text, division_name text, attendance_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;
  if v_membership_id is null
    or not private.can_access_student(p_student_id,p_institution_id,'attendance.read') then
    raise exception 'Attendance access denied' using errcode='42501';
  end if;

  return query
  select
    s.id,
    s.held_on,
    s.period_label,
    d.name,
    ar.status
  from public.attendance_records ar
  join public.attendance_sessions s
    on s.id=ar.session_id and s.institution_id=ar.institution_id
  join public.divisions d
    on d.id=s.division_id and d.institution_id=s.institution_id
  where ar.institution_id=p_institution_id
    and ar.student_id=p_student_id
    and s.status in ('submitted','locked')
  order by s.held_on desc,s.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100);
end;
$function$


CREATE OR REPLACE FUNCTION public.list_my_portal_students(p_institution_id uuid)
 RETURNS TABLE(student_id uuid, first_name text, last_name text, student_number text, is_self boolean, division_id uuid, division_name text, course_name text, academic_year_id uuid, academic_year_name text, enrollment_status text, can_view_grades boolean, can_view_attendance boolean, attendance_present integer, attendance_absent integer, attendance_late integer, attendance_justified integer, attendance_early_departure integer, attendance_total integer, last_attendance_on date, published_report_card_count integer, latest_report_card_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.list_my_portal_students_impl(p_institution_id);
$function$


CREATE OR REPLACE FUNCTION public.list_my_student_attendance(p_institution_id uuid, p_student_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(session_id uuid, held_on date, period_label text, division_name text, attendance_status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.list_my_student_attendance_impl(
    p_institution_id,p_student_id,p_limit
  );
$function$


revoke all on function private.list_my_portal_students_impl(uuid) from public,anon;
grant execute on function private.list_my_portal_students_impl(uuid) to authenticated;
revoke all on function public.list_my_portal_students(uuid) from public,anon;
grant execute on function public.list_my_portal_students(uuid) to authenticated;

revoke all on function private.list_my_student_attendance_impl(uuid,uuid,integer) from public,anon;
grant execute on function private.list_my_student_attendance_impl(uuid,uuid,integer) to authenticated;
revoke all on function public.list_my_student_attendance(uuid,uuid,integer) from public,anon;
grant execute on function public.list_my_student_attendance(uuid,uuid,integer) to authenticated;
