-- Align classroom authorization with role-specific staff assignments and
-- enrollment dates. A membership may hold multiple roles, but a role may only
-- use assignments of its own assignment_type.
create or replace function private.can_access_classroom(
  p_classroom_id uuid,
  p_institution_id uuid,
  p_permission_key text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.virtual_classrooms vc
    join public.memberships m
      on m.institution_id = vc.institution_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    where vc.id = p_classroom_id
      and vc.institution_id = p_institution_id
      and private.has_institution_permission(p_institution_id, p_permission_key)
      and (
        -- Institution administrator: full scope within this institution.
        (
          r.key = 'institution_admin'
          and p_permission_key in (
            'classroom.read',
            'classroom.manage',
            'classroom.grade'
          )
        )
        or
        -- Director: read-only institutional scope.
        (
          r.key = 'director'
          and p_permission_key = 'classroom.read'
        )
        or
        -- Teacher: assignment must explicitly be a teacher assignment.
        -- Subject assignments grant access only to that subject's classroom;
        -- division-wide assignments (course_subject_id NULL) grant division scope.
        (
          r.key = 'teacher'
          and p_permission_key in (
            'classroom.read',
            'classroom.manage',
            'classroom.grade'
          )
          and exists (
            select 1
            from public.staff_assignments sa
            where sa.membership_id = m.id
              and sa.institution_id = vc.institution_id
              and sa.assignment_type = 'teacher'
              and (sa.starts_on is null or sa.starts_on <= current_date)
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (
                (
                  sa.course_subject_id is null
                  and sa.division_id = vc.division_id
                )
                or (
                  vc.course_subject_id is not null
                  and sa.division_id = vc.division_id
                  and sa.course_subject_id = vc.course_subject_id
                )
              )
          )
        )
        or
        -- Student: own active enrollment, valid on the current date.
        (
          r.key = 'student'
          and p_permission_key in ('classroom.read', 'classroom.submit')
          and exists (
            select 1
            from public.student_memberships sm
            join public.enrollments e
              on e.student_id = sm.student_id
             and e.institution_id = sm.institution_id
            where sm.membership_id = m.id
              and sm.institution_id = vc.institution_id
              and e.division_id = vc.division_id
              and e.status = 'active'
              and (e.enrolled_on is null or e.enrolled_on <= current_date)
              and (e.ended_on is null or e.ended_on >= current_date)
          )
        )
        or
        -- Guardian: read-only access to a linked student with a current enrollment.
        (
          r.key = 'guardian'
          and p_permission_key = 'classroom.read'
          and exists (
            select 1
            from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id = g.id
             and sg.institution_id = g.institution_id
            join public.enrollments e
              on e.student_id = sg.student_id
             and e.institution_id = sg.institution_id
            where g.membership_id = m.id
              and g.institution_id = vc.institution_id
              and e.division_id = vc.division_id
              and e.status = 'active'
              and (e.enrolled_on is null or e.enrolled_on <= current_date)
              and (e.ended_on is null or e.ended_on >= current_date)
          )
        )
      )
  );
$function$;

revoke all on function private.can_access_classroom(uuid, uuid, text)
  from public, anon;
grant execute on function private.can_access_classroom(uuid, uuid, text)
  to authenticated;

comment on function private.can_access_classroom(uuid, uuid, text)
is 'Checks institutional permission, role-matched teacher assignment scope, and current enrollment dates for students and guardians.';
