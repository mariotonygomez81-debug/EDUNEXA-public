-- A staff member must hold the matching institutional role for the assignment
-- that grants attendance management. Multiple roles remain supported: each role
-- is evaluated only against assignments of the same type.
create or replace function private.can_manage_division(
  p_division_id uuid,
  p_institution_id uuid,
  p_permission_key text
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and private.has_institution_permission(p_institution_id, p_permission_key)
      and (
        r.key in ('institution_admin', 'administrative')
        or (
          r.key in ('teacher', 'prefect')
          and exists (
            select 1
            from public.staff_assignments sa
            join public.divisions d
              on d.id = p_division_id
             and d.institution_id = p_institution_id
            left join public.course_subjects cs
              on cs.id = sa.course_subject_id
             and cs.institution_id = sa.institution_id
            where sa.membership_id = m.id
              and sa.institution_id = p_institution_id
              and sa.assignment_type = r.key
              and (
                sa.division_id = p_division_id
                or (cs.course_id = d.course_id and sa.course_subject_id is not null)
              )
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (sa.starts_on is null or sa.starts_on <= current_date)
          )
        )
      )
  );
$function$;

revoke all on function private.can_manage_division(uuid, uuid, text) from public, anon;
grant execute on function private.can_manage_division(uuid, uuid, text) to authenticated;

comment on function private.can_manage_division(uuid, uuid, text)
is 'Checks an effective permission and matching role-specific division or subject assignment; institution administrators and explicitly authorized administrative staff retain institution-wide scope.';


-- Keep student-record reads aligned with the same role-to-assignment rule.
-- Secretariat is a school-wide academic-record reader, but only receives the
-- capabilities explicitly granted to that role (for example students.read).
create or replace function private.can_access_student(
  p_student_id uuid,
  p_institution_id uuid,
  p_permission_key text
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and private.has_institution_permission(p_institution_id, p_permission_key)
      and (
        r.key in ('institution_admin', 'administrative', 'director', 'secretary')
        or (
          r.key in ('teacher', 'prefect')
          and exists (
            select 1
            from public.staff_assignments sa
            join public.enrollments e
              on e.institution_id = sa.institution_id
            join public.divisions d
              on d.id = e.division_id
             and d.institution_id = e.institution_id
            where sa.membership_id = m.id
              and sa.institution_id = p_institution_id
              and sa.assignment_type = r.key
              and e.student_id = p_student_id
              and e.status = 'active'
              and (
                sa.division_id = e.division_id
                or exists (
                  select 1
                  from public.course_subjects cs
                  where cs.id = sa.course_subject_id
                    and cs.institution_id = sa.institution_id
                    and cs.course_id = d.course_id
                )
              )
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (sa.starts_on is null or sa.starts_on <= current_date)
          )
        )
        or (
          r.key = 'guardian'
          and exists (
            select 1
            from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id = g.id
             and sg.institution_id = g.institution_id
            where g.membership_id = m.id
              and g.institution_id = p_institution_id
              and sg.student_id = p_student_id
              and (
                p_permission_key not in ('grades.read', 'attendance.read')
                or (p_permission_key = 'grades.read' and sg.can_view_grades)
                or (p_permission_key = 'attendance.read' and sg.can_view_attendance)
              )
          )
        )
        or (
          r.key = 'student'
          and exists (
            select 1
            from public.student_memberships sm
            where sm.membership_id = m.id
              and sm.institution_id = p_institution_id
              and sm.student_id = p_student_id
          )
        )
      )
  );
$function$;

revoke all on function private.can_access_student(uuid, uuid, text) from public, anon;
grant execute on function private.can_access_student(uuid, uuid, text) to authenticated;

comment on function private.can_access_student(uuid, uuid, text)
is 'Checks institution permission and student relationship; teacher and prefect reads require an active assignment matching the corresponding role.';
