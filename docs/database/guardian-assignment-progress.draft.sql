-- DRAFT ONLY — NOT A SUPABASE MIGRATION.
-- Guardian-only, per-child assignment progress read model.
-- Review against the target schema and validate on an isolated free local database
-- before generating a migration with: supabase migration new guardian_assignment_progress.
-- Never apply this draft to production.

create or replace function private.list_my_child_assignment_progress_impl(
  p_institution_id uuid,
  p_student_id uuid
)
returns table (
  assignment_id uuid,
  classroom_id uuid,
  subject_name text,
  classroom_title text,
  assignment_title text,
  due_at timestamptz,
  published_at timestamptz,
  submitted boolean,
  submitted_at timestamptz,
  review_status text,
  score numeric,
  max_score numeric,
  can_view_grade boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_institution_id is null or p_student_id is null then
    raise exception 'Student progress access denied' using errcode = '42501';
  end if;

  select m.id
    into v_membership_id
  from public.memberships m
  join public.membership_roles mr
    on mr.membership_id = m.id
   and mr.institution_id = m.institution_id
  join public.roles r
    on r.id = mr.role_id
  where m.user_id = v_user_id
    and m.institution_id = p_institution_id
    and m.status = 'active'
    and r.key = 'guardian'
  limit 1;

  if v_membership_id is null
     or not private.can_access_student(
       p_student_id, p_institution_id, 'classroom.read'
     ) then
    raise exception 'Student progress access denied' using errcode = '42501';
  end if;

  -- Require an explicit guardian-child link and an active enrollment.
  -- This prevents a guardian's access to one child in a division from
  -- implicitly authorizing progress for every other student in that division.
  return query
  select
    a.id,
    vc.id,
    coalesce(subj.name, vc.title),
    vc.title,
    a.title,
    a.due_at,
    a.published_at,
    (sub.id is not null and sub.submitted_at is not null),
    sub.submitted_at,
    sub.review_status,
    case
      when sg.can_view_grades
       and private.can_access_student(
         p_student_id, p_institution_id, 'grades.read'
       )
      then sub.score
      else null
    end,
    a.max_score,
    (
      sg.can_view_grades
      and private.can_access_student(
        p_student_id, p_institution_id, 'grades.read'
      )
    )
  from public.student_guardians sg
  join public.guardians g
    on g.id = sg.guardian_id
   and g.institution_id = sg.institution_id
   and g.membership_id = v_membership_id
  join public.enrollments e
    on e.student_id = sg.student_id
   and e.institution_id = sg.institution_id
   and e.status = 'active'
   and e.enrolled_on <= current_date
   and (e.ended_on is null or e.ended_on >= current_date)
  join public.virtual_classrooms vc
    on vc.institution_id = e.institution_id
   and vc.division_id = e.division_id
  join public.assignments a
    on a.classroom_id = vc.id
   and a.institution_id = vc.institution_id
   and a.published_at is not null
  left join public.course_subjects cs
    on cs.id = vc.course_subject_id
   and cs.institution_id = vc.institution_id
  left join public.subjects subj
    on subj.id = cs.subject_id
   and subj.institution_id = cs.institution_id
  left join public.submissions sub
    on sub.assignment_id = a.id
   and sub.institution_id = a.institution_id
   and sub.student_id = sg.student_id
  where sg.institution_id = p_institution_id
    and sg.student_id = p_student_id
    and private.can_access_classroom(
      vc.id, vc.institution_id, 'classroom.read'
    )
  order by coalesce(a.due_at, a.created_at) desc, a.created_at desc;
end;
$function$;

revoke all on function private.list_my_child_assignment_progress_impl(uuid, uuid)
  from public, anon;
grant execute on function private.list_my_child_assignment_progress_impl(uuid, uuid)
  to authenticated;

create or replace function public.list_my_child_assignment_progress(
  p_institution_id uuid,
  p_student_id uuid
)
returns table (
  assignment_id uuid,
  classroom_id uuid,
  subject_name text,
  classroom_title text,
  assignment_title text,
  due_at timestamptz,
  published_at timestamptz,
  submitted boolean,
  submitted_at timestamptz,
  review_status text,
  score numeric,
  max_score numeric,
  can_view_grade boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select *
  from private.list_my_child_assignment_progress_impl(
    p_institution_id, p_student_id
  );
$function$;

revoke all on function public.list_my_child_assignment_progress(uuid, uuid)
  from public, anon;
grant execute on function public.list_my_child_assignment_progress(uuid, uuid)
  to authenticated;

-- Deliberately absent from the result: submission body, file_path,
-- assignment instructions, teacher feedback, revision history, grade-event
-- history, student identifiers beyond the scoped input, and other children.
