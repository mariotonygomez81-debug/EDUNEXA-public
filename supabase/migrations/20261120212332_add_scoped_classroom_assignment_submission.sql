create or replace function private.submit_classroom_assignment_impl(
  p_assignment_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_institution_id uuid;
  v_division_id uuid;
  v_student_id uuid;
  v_submission_id uuid;
  v_existing_score numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_body is null or length(btrim(p_body)) < 1 or length(p_body) > 20000 then
    raise exception 'Submission text must contain between 1 and 20000 characters' using errcode = '22023';
  end if;

  select a.institution_id, vc.division_id
    into v_institution_id, v_division_id
  from public.assignments a
  join public.virtual_classrooms vc
    on vc.id = a.classroom_id and vc.institution_id = a.institution_id
  where a.id = p_assignment_id
    and a.published_at is not null
    and (a.due_at is null or a.due_at >= now());

  if v_institution_id is null or not private.can_submit_to_assignment(p_assignment_id, v_institution_id) then
    raise exception 'Assignment is not available for submission' using errcode = '42501';
  end if;

  select sm.student_id into v_student_id
  from public.memberships m
  join public.student_memberships sm
    on sm.membership_id = m.id and sm.institution_id = m.institution_id
  join public.enrollments e
    on e.student_id = sm.student_id and e.institution_id = sm.institution_id
  where m.user_id = v_user_id
    and m.institution_id = v_institution_id
    and m.status = 'active'
    and e.division_id = v_division_id
    and e.status = 'active'
  order by e.created_at desc
  limit 1;

  if v_student_id is null then
    raise exception 'Active student enrollment required' using errcode = '42501';
  end if;

  select s.id, s.score into v_submission_id, v_existing_score
  from public.submissions s
  where s.institution_id = v_institution_id
    and s.assignment_id = p_assignment_id
    and s.student_id = v_student_id
  for update;

  if v_submission_id is null then
    insert into public.submissions (
      institution_id, assignment_id, student_id, body, submitted_at
    ) values (
      v_institution_id, p_assignment_id, v_student_id, btrim(p_body), now()
    )
    returning id into v_submission_id;

    insert into public.submission_revisions (
      institution_id, submission_id, revision_number, body, file_path, submitted_at, changed_by
    ) values (
      v_institution_id, v_submission_id, 1, btrim(p_body), null, now(), v_user_id
    );
  else
    if v_existing_score is not null then
      raise exception 'A graded submission cannot be edited' using errcode = '42501';
    end if;

    update public.submissions
       set body = btrim(p_body), submitted_at = now()
     where id = v_submission_id
       and institution_id = v_institution_id;
  end if;

  return v_submission_id;
end;
$function$;

revoke all on function private.submit_classroom_assignment_impl(uuid,text) from public, anon;
grant execute on function private.submit_classroom_assignment_impl(uuid,text) to authenticated;

create or replace function public.submit_classroom_assignment(
  p_assignment_id uuid,
  p_body text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.submit_classroom_assignment_impl(p_assignment_id, p_body);
$function$;

revoke all on function public.submit_classroom_assignment(uuid,text) from public, anon;
grant execute on function public.submit_classroom_assignment(uuid,text) to authenticated;
