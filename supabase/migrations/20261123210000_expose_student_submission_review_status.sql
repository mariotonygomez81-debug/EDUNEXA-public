-- Add the teacher's review state to the scoped student submission listing.
-- Existing access checks for grades and feedback remain unchanged.
drop function if exists public.list_classroom_submissions(uuid);
drop function if exists private.list_classroom_submissions_impl(uuid);

create or replace function private.list_classroom_submissions_impl(
  p_classroom_id uuid
)
returns table (
  assignment_id uuid,
  submission_id uuid,
  student_id uuid,
  student_first_name text,
  student_last_name text,
  student_number text,
  body text,
  submitted_at timestamptz,
  review_status text,
  score numeric,
  feedback text,
  graded_by uuid,
  can_grade boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_institution_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select vc.institution_id into v_institution_id
  from public.virtual_classrooms vc
  where vc.id = p_classroom_id;

  if v_institution_id is null
     or not private.can_access_classroom(p_classroom_id, v_institution_id, 'classroom.read') then
    raise exception 'Classroom access denied' using errcode = '42501';
  end if;

  return query
  select
    s.assignment_id,
    s.id,
    s.student_id,
    st.first_name,
    st.last_name,
    st.student_number,
    s.body,
    s.submitted_at,
    s.review_status,
    case
      when private.can_access_submission(s.id, s.institution_id, 'classroom.grade')
        or exists (
          select 1
          from public.memberships m
          join public.membership_roles mr on mr.membership_id = m.id and mr.institution_id = m.institution_id
          join public.roles r on r.id = mr.role_id
          where m.user_id = (select auth.uid())
            and m.institution_id = s.institution_id
            and m.status = 'active'
            and r.key = 'student'
        )
        or exists (
          select 1
          from public.guardians g
          join public.student_guardians sg on sg.guardian_id = g.id and sg.institution_id = g.institution_id
          where g.institution_id = s.institution_id
            and sg.student_id = s.student_id
            and sg.can_view_grades
            and g.membership_id in (
              select m.id from public.memberships m
              where m.user_id = (select auth.uid())
                and m.institution_id = s.institution_id
                and m.status = 'active'
            )
        )
      then s.score else null
    end,
    case
      when private.can_access_submission(s.id, s.institution_id, 'classroom.grade')
        or exists (
          select 1
          from public.memberships m
          join public.membership_roles mr on mr.membership_id = m.id and mr.institution_id = m.institution_id
          join public.roles r on r.id = mr.role_id
          where m.user_id = (select auth.uid())
            and m.institution_id = s.institution_id
            and m.status = 'active'
            and r.key = 'student'
        )
        or exists (
          select 1
          from public.guardians g
          join public.student_guardians sg on sg.guardian_id = g.id and sg.institution_id = g.institution_id
          where g.institution_id = s.institution_id
            and sg.student_id = s.student_id
            and sg.can_view_grades
            and g.membership_id in (
              select m.id from public.memberships m
              where m.user_id = (select auth.uid())
                and m.institution_id = s.institution_id
                and m.status = 'active'
            )
        )
      then s.feedback else null
    end,
    case when private.can_access_submission(s.id, s.institution_id, 'classroom.grade') then s.graded_by else null end,
    private.can_access_submission(s.id, s.institution_id, 'classroom.grade')
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id and a.institution_id = s.institution_id
  join public.students st on st.id = s.student_id and st.institution_id = s.institution_id
  where a.classroom_id = p_classroom_id
    and private.can_access_submission(s.id, s.institution_id, 'classroom.read')
  order by s.submitted_at desc nulls last, st.last_name, st.first_name;
end;
$function$;

revoke all on function private.list_classroom_submissions_impl(uuid) from public, anon;
grant execute on function private.list_classroom_submissions_impl(uuid) to authenticated;

create or replace function public.list_classroom_submissions(p_classroom_id uuid)
returns table (
  assignment_id uuid,
  submission_id uuid,
  student_id uuid,
  student_first_name text,
  student_last_name text,
  student_number text,
  body text,
  submitted_at timestamptz,
  review_status text,
  score numeric,
  feedback text,
  graded_by uuid,
  can_grade boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.list_classroom_submissions_impl(p_classroom_id);
$function$;

revoke all on function public.list_classroom_submissions(uuid) from public, anon;
grant execute on function public.list_classroom_submissions(uuid) to authenticated;

revoke all on function private.list_classroom_submissions_impl(uuid) from public, anon;
grant execute on function private.list_classroom_submissions_impl(uuid) to authenticated;
revoke all on function public.list_classroom_submissions(uuid) from public, anon;
grant execute on function public.list_classroom_submissions(uuid) to authenticated;
