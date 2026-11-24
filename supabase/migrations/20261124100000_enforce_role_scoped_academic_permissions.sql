-- Keep each contextual access decision within the same active membership role.
-- A role must provide both the contextual scope and the requested permission.
-- This migration intentionally preserves function signatures, SECURITY DEFINER,
-- empty search_path, and existing grants/ACLs.

create or replace function private.can_access_student(
  p_student_id uuid,
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and p.key = p_permission_key
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
              and e.enrolled_on <= current_date
              and (e.ended_on is null or e.ended_on >= current_date)
              and sa.division_id = e.division_id
              and (
                sa.course_subject_id is null
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

create or replace function private.can_access_classroom(
  p_classroom_id uuid,
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists(
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
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where vc.id = p_classroom_id
      and vc.institution_id = p_institution_id
      and p.key = case
        when p_permission_key in (
          'classroom.materials.edit',
          'classroom.assignments.edit',
          'classroom.attendance.manage'
        ) then 'classroom.read'
        else p_permission_key
      end
      and (
        (r.key = 'institution_admin' and p_permission_key = 'classroom.read')
        or (r.key in ('director','prefect') and p_permission_key = 'classroom.read')
        or (
          r.key = 'teacher'
          and (
            exists(
              select 1
              from public.staff_assignments sa
              where sa.membership_id = m.id
                and sa.institution_id = vc.institution_id
                and sa.assignment_type = 'teacher'
                and (sa.starts_on is null or sa.starts_on <= current_date)
                and (sa.ends_on is null or sa.ends_on >= current_date)
                and (
                  (sa.course_subject_id is null and sa.division_id = vc.division_id)
                  or (
                    vc.course_subject_id is not null
                    and sa.division_id = vc.division_id
                    and sa.course_subject_id = vc.course_subject_id
                  )
                )
            )
            or exists(
              select 1
              from public.classroom_teacher_permissions ctp
              where ctp.classroom_id = vc.id
                and ctp.institution_id = vc.institution_id
                and ctp.teacher_membership_id = m.id
                and ctp.is_active
            )
            or vc.owner_membership_id = m.id
            or vc.created_by = m.user_id
          )
          and (
            p_permission_key = 'classroom.read'
            or vc.owner_membership_id = m.id
            or vc.created_by = m.user_id
            or exists(
              select 1
              from public.classroom_teacher_permissions ctp
              where ctp.classroom_id = vc.id
                and ctp.institution_id = vc.institution_id
                and ctp.teacher_membership_id = m.id
                and ctp.is_active
                and (
                  (p_permission_key = 'classroom.grade' and ctp.can_grade)
                  or (p_permission_key = 'classroom.materials.edit' and ctp.can_edit_materials)
                  or (p_permission_key = 'classroom.assignments.edit' and ctp.can_edit_assignments)
                  or (p_permission_key = 'classroom.attendance.manage' and ctp.can_attendance)
                )
            )
          )
        )
        or (
          r.key = 'student'
          and p_permission_key in ('classroom.read','classroom.submit')
          and exists(
            select 1
            from public.classroom_members cm
            where cm.classroom_id = vc.id
              and cm.institution_id = vc.institution_id
              and cm.membership_id = m.id
              and cm.member_role = 'student'
          )
        )
        or (
          r.key = 'guardian'
          and p_permission_key = 'classroom.read'
          and exists(
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
              and e.enrolled_on <= current_date
              and (e.ended_on is null or e.ended_on >= current_date)
          )
        )
      )
  );
$function$;

create or replace function private.can_manage_division(
  p_division_id uuid,
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and p.key = p_permission_key
      and (
        r.key = 'institution_admin'
        or (
          r.key in ('teacher', 'prefect')
          and exists (
            select 1
            from public.staff_assignments sa
            where sa.membership_id = m.id
              and sa.institution_id = p_institution_id
              and sa.assignment_type = r.key
              and sa.division_id = p_division_id
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (sa.starts_on is null or sa.starts_on <= current_date)
          )
        )
      )
  );
$function$;

create or replace function private.can_manage_course_subject(
  p_division_id uuid,
  p_course_subject_id uuid,
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.divisions d
      on d.id = p_division_id
     and d.institution_id = p_institution_id
    join public.course_subjects cs
      on cs.id = p_course_subject_id
     and cs.institution_id = p_institution_id
     and cs.course_id = d.course_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and p.key = p_permission_key
      and (
        r.key = 'institution_admin'
        or (
          r.key = 'teacher'
          and exists (
            select 1
            from public.staff_assignments sa
            where sa.membership_id = m.id
              and sa.institution_id = p_institution_id
              and sa.assignment_type = 'teacher'
              and sa.division_id = p_division_id
              and (sa.course_subject_id is null or sa.course_subject_id = p_course_subject_id)
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (sa.starts_on is null or sa.starts_on <= current_date)
          )
        )
      )
  );
$function$;
