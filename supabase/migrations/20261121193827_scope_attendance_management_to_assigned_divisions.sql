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
                or (
                  p_permission_key <> 'attendance.manage'
                  and cs.course_id = d.course_id
                  and sa.course_subject_id is not null
                )
              )
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (sa.starts_on is null or sa.starts_on <= current_date)
          )
        )
      )
  );
$function$;
