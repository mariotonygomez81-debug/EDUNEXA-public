-- Classroom assignments use a percentage scale capped at 100.
-- NULL max_score means the activity is formative and has no numeric grade.
alter table public.assignments
  add constraint assignments_max_score_percent_check
  check (max_score is null or max_score = 100);

create or replace function private.create_classroom_assignment_impl(
  p_classroom_id uuid,p_title text,p_instructions text,p_due_at timestamptz,
  p_max_score numeric,p_publish boolean default false
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_id uuid; v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160
    or coalesce(length(p_instructions),0)>20000
    or (p_max_score is not null and p_max_score<>100) then
    raise exception 'Invalid assignment content' using errcode='22023';
  end if;
  select vc.institution_id into v_institution_id from public.virtual_classrooms vc where vc.id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'Classroom management not permitted' using errcode='42501';
  end if;
  insert into public.assignments(institution_id,classroom_id,title,instructions,due_at,max_score,published_at,created_by)
  values(v_institution_id,p_classroom_id,btrim(p_title),nullif(btrim(p_instructions),''),p_due_at,p_max_score,
    case when coalesce(p_publish,false) then now() else null end,v_user_id)
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function private.create_classroom_assignment_impl(uuid,text,text,timestamptz,numeric,boolean) from public,anon;
grant execute on function private.create_classroom_assignment_impl(uuid,text,text,timestamptz,numeric,boolean) to authenticated;

create or replace function private.update_classroom_assignment_impl(
  p_classroom_id uuid,p_assignment_id uuid,p_title text,p_instructions text,
  p_due_at timestamptz,p_max_score numeric,p_publish boolean
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_published_at timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160
    or coalesce(length(p_instructions),0)>20000
    or (p_max_score is not null and (p_max_score<=0 or p_max_score>100)) then
    raise exception 'Invalid assignment content' using errcode='22023';
  end if;
  select vc.institution_id into v_institution_id from public.virtual_classrooms vc where vc.id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'Assignment editing not permitted' using errcode='42501';
  end if;
  select a.published_at into v_published_at from public.assignments a
    where a.id=p_assignment_id and a.classroom_id=p_classroom_id and a.institution_id=v_institution_id for update;
  if not found then raise exception 'Assignment not found in this classroom' using errcode='P0002'; end if;
  if exists(select 1 from public.submissions s where s.assignment_id=p_assignment_id
      and s.institution_id=v_institution_id and s.score is not null
      and (p_max_score is null or s.score>p_max_score)) then
    raise exception 'Maximum score cannot be removed or reduced below an existing grade' using errcode='23514';
  end if;
  if not coalesce(p_publish,false) and exists(select 1 from public.submissions s
      where s.assignment_id=p_assignment_id and s.institution_id=v_institution_id and s.score is not null) then
    raise exception 'An assignment with graded submissions cannot be unpublished' using errcode='23514';
  end if;
  update public.assignments set title=btrim(p_title),instructions=nullif(btrim(p_instructions),''),
    due_at=p_due_at,max_score=p_max_score,
    published_at=case when coalesce(p_publish,false) then coalesce(v_published_at,now()) else null end
  where id=p_assignment_id and classroom_id=p_classroom_id and institution_id=v_institution_id;
  return p_assignment_id;
end;
$function$;
revoke all on function private.update_classroom_assignment_impl(uuid,uuid,text,text,timestamptz,numeric,boolean) from public,anon;
grant execute on function private.update_classroom_assignment_impl(uuid,uuid,text,text,timestamptz,numeric,boolean) to authenticated;

create or replace function private.grade_classroom_submission_impl(
  p_submission_id uuid,p_score numeric,p_feedback text default null
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user_id uuid := (select auth.uid()); v_institution_id uuid; v_max_score numeric; v_published_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if (p_score is not null and (p_score<0 or p_score>100)) or
     (p_feedback is not null and length(p_feedback)>5000) then
    raise exception 'Invalid score or feedback' using errcode='22023';
  end if;
  if p_score is null and nullif(btrim(p_feedback),'') is null then
    raise exception 'A qualitative feedback message is required when no score is supplied' using errcode='22023';
  end if;
  select s.institution_id,a.max_score,a.published_at into v_institution_id,v_max_score,v_published_at
  from public.submissions s join public.assignments a on a.id=s.assignment_id and a.institution_id=s.institution_id
  where s.id=p_submission_id for update of s;
  if v_institution_id is null or not private.can_access_submission(p_submission_id,v_institution_id,'classroom.grade') then
    raise exception 'Submission grading access denied' using errcode='42501';
  end if;
  if v_published_at is null then raise exception 'A published assignment is required before feedback' using errcode='23514'; end if;
  if (v_max_score is null and p_score is not null) or (v_max_score is not null and p_score is null) then
    raise exception 'The score mode must match the assignment configuration' using errcode='23514';
  end if;
  if p_score is not null and p_score>v_max_score then
    raise exception 'Score exceeds assignment maximum' using errcode='23514';
  end if;
  update public.submissions set score=p_score,feedback=nullif(btrim(p_feedback),''),graded_by=v_user_id
  where id=p_submission_id and institution_id=v_institution_id;
  return p_submission_id;
end;
$function$;
revoke all on function private.grade_classroom_submission_impl(uuid,numeric,text) from public,anon;
grant execute on function private.grade_classroom_submission_impl(uuid,numeric,text) to authenticated;
