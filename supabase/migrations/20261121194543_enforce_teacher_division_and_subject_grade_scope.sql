-- Align teacher grade-management scope with the exact division and assigned subject.
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
      on mr.membership_id = m.id and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    join public.divisions d
      on d.id = p_division_id and d.institution_id = p_institution_id
    join public.course_subjects cs
      on cs.id = p_course_subject_id
     and cs.institution_id = p_institution_id
     and cs.course_id = d.course_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and private.has_institution_permission(p_institution_id, p_permission_key)
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

revoke all on function private.can_manage_course_subject(uuid, uuid, uuid, text) from public, anon;
grant execute on function private.can_manage_course_subject(uuid, uuid, uuid, text) to authenticated;
revoke all on function private.can_manage_division(uuid, uuid, text) from public, anon;
grant execute on function private.can_manage_division(uuid, uuid, text) to authenticated;

drop policy if exists assessments_scoped_insert on public.assessments;
create policy assessments_scoped_insert on public.assessments
for insert to authenticated
with check (private.can_manage_course_subject(division_id, course_subject_id, institution_id, 'grades.manage'));

drop policy if exists assessments_scoped_update on public.assessments;
create policy assessments_scoped_update on public.assessments
for update to authenticated
using (private.can_manage_course_subject(division_id, course_subject_id, institution_id, 'grades.manage'))
with check (private.can_manage_course_subject(division_id, course_subject_id, institution_id, 'grades.manage'));

drop policy if exists grade_records_scoped_insert on public.grade_records;
create policy grade_records_scoped_insert on public.grade_records
for insert to authenticated
with check (
  exists (
    select 1
    from public.assessments a
    join public.enrollments e
      on e.institution_id = a.institution_id
     and e.division_id = a.division_id
     and e.student_id = grade_records.student_id
     and e.status = 'active'
    where a.id = grade_records.assessment_id
      and a.institution_id = grade_records.institution_id
      and private.can_manage_course_subject(a.division_id, a.course_subject_id, a.institution_id, 'grades.manage')
  )
);

drop policy if exists grade_records_scoped_update on public.grade_records;
create policy grade_records_scoped_update on public.grade_records
for update to authenticated
using (
  exists (
    select 1
    from public.assessments a
    join public.enrollments e
      on e.institution_id = a.institution_id
     and e.division_id = a.division_id
     and e.student_id = grade_records.student_id
     and e.status = 'active'
    where a.id = grade_records.assessment_id
      and a.institution_id = grade_records.institution_id
      and private.can_access_student(e.student_id, e.institution_id, 'grades.read')
      and private.can_manage_course_subject(a.division_id, a.course_subject_id, a.institution_id, 'grades.manage')
  )
)
with check (
  exists (
    select 1
    from public.assessments a
    join public.enrollments e
      on e.institution_id = a.institution_id
     and e.division_id = a.division_id
     and e.student_id = grade_records.student_id
     and e.status = 'active'
    where a.id = grade_records.assessment_id
      and a.institution_id = grade_records.institution_id
      and private.can_manage_course_subject(a.division_id, a.course_subject_id, a.institution_id, 'grades.manage')
  )
);

create or replace function private.save_grade_records_batch_impl(
  p_assessment_id uuid,
  p_rows jsonb,
  p_change_reason text default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_assessment record;
  v_row jsonb;
  v_student_id uuid;
  v_score numeric;
  v_comment text;
  v_existing public.grade_records%rowtype;
  v_reason text;
  v_action text;
  v_changed integer := 0;
  v_total integer;
  v_distinct integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Grade batch must be a JSON array' using errcode='22023';
  end if;
  v_total:=jsonb_array_length(p_rows);
  if v_total<1 or v_total>100 then raise exception 'Grade batch must contain between 1 and 100 rows' using errcode='22023'; end if;
  select count(distinct value->>'student_id') into v_distinct from jsonb_array_elements(p_rows);
  if v_distinct<>v_total then raise exception 'A student may appear only once in a grade batch' using errcode='22023'; end if;

  select a.id,a.institution_id,a.division_id,a.course_subject_id,a.grading_period_id,a.max_score,
         gp.starts_on,gp.ends_on,gp.status
  into v_assessment
  from public.assessments a
  join public.grading_periods gp on gp.id=a.grading_period_id and gp.institution_id=a.institution_id
  where a.id=p_assessment_id
  for update of a;
  if v_assessment.id is null then raise exception 'Assessment not found' using errcode='P0002'; end if;
  if v_assessment.status is distinct from 'open' then
    raise exception 'The grading period is closed' using errcode='23514';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=v_user_id and m.institution_id=v_assessment.institution_id and m.status='active'
  limit 1;
  if v_membership_id is null
    or not private.has_institution_permission(v_assessment.institution_id,'grades.manage')
    or not private.can_manage_course_subject(v_assessment.division_id,v_assessment.course_subject_id,v_assessment.institution_id,'grades.manage') then
    raise exception 'Grade management permission denied for this division and subject' using errcode='42501';
  end if;

  v_reason:=nullif(btrim(p_change_reason),'');
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_student_id:=nullif(v_row->>'student_id','')::uuid;
    v_score:=nullif(v_row->>'score','')::numeric;
    v_comment:=nullif(btrim(v_row->>'comment'),'');
    if v_student_id is null then raise exception 'Student id is required' using errcode='22023'; end if;
    if v_score is not null and (v_score<0 or v_score>v_assessment.max_score) then
      raise exception 'Score must be between 0 and the assessment maximum' using errcode='23514';
    end if;
    if v_comment is not null and length(v_comment)>1000 then
      raise exception 'Grade comment is too long' using errcode='22023';
    end if;
    if not exists (
      select 1 from public.enrollments e
      where e.institution_id=v_assessment.institution_id
        and e.student_id=v_student_id and e.division_id=v_assessment.division_id
        and e.enrolled_on<=v_assessment.ends_on
        and (e.ended_on is null or e.ended_on>=v_assessment.starts_on)
    ) then
      raise exception 'Student is not enrolled in the assessment division during the grading period' using errcode='42501';
    end if;

    select * into v_existing from public.grade_records gr
    where gr.institution_id=v_assessment.institution_id
      and gr.assessment_id=p_assessment_id and gr.student_id=v_student_id
    for update;

    if v_existing.id is not null then
      if v_existing.score is distinct from v_score or v_existing.comment is distinct from v_comment then
        if v_reason is null or length(v_reason)<10 or length(v_reason)>500 then
          raise exception 'A reason between 10 and 500 characters is required to correct an existing grade' using errcode='22023';
        end if;
        v_action:=case when v_score is null and v_existing.score is not null then 'cleared' else 'updated' end;
        insert into public.grade_record_events(
          institution_id,assessment_id,student_id,actor_membership_id,action,
          old_score,new_score,old_comment,new_comment,change_reason
        ) values (
          v_assessment.institution_id,p_assessment_id,v_student_id,v_membership_id,v_action,
          v_existing.score,v_score,v_existing.comment,v_comment,v_reason
        );
        update public.grade_records
        set score=v_score,comment=v_comment,entered_by=v_user_id,updated_at=now()
        where id=v_existing.id;
        v_changed:=v_changed+1;
      end if;
    elsif v_score is not null or v_comment is not null then
      insert into public.grade_records(
        institution_id,assessment_id,student_id,score,comment,entered_by,entered_at,updated_at
      ) values (
        v_assessment.institution_id,p_assessment_id,v_student_id,v_score,v_comment,v_user_id,now(),now()
      );
      insert into public.grade_record_events(
        institution_id,assessment_id,student_id,actor_membership_id,action,
        old_score,new_score,old_comment,new_comment,change_reason
      ) values (
        v_assessment.institution_id,p_assessment_id,v_student_id,v_membership_id,'created',
        null,v_score,null,v_comment,null
      );
      v_changed:=v_changed+1;
    end if;
  end loop;
  return v_changed;
end;
$function$;

create or replace function private.assign_staff_to_structure_impl(
  p_institution_id uuid,
  p_membership_id uuid,
  p_assignment_type text,
  p_division_id uuid,
  p_course_subject_id uuid,
  p_starts_on date,
  p_ends_on date
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_starts_on date:=coalesce(p_starts_on,current_date);
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if p_membership_id is null or p_assignment_type not in ('teacher','prefect','director','administrative')
    or (p_ends_on is not null and p_ends_on<v_starts_on) then
    raise exception 'Invalid staff assignment data' using errcode='22023';
  end if;
  if not exists(select 1 from public.memberships m where m.id=p_membership_id and m.institution_id=p_institution_id and m.status='active')
    or not exists (
      select 1 from public.membership_roles mr
      join public.roles r on r.id=mr.role_id
      where mr.membership_id=p_membership_id and mr.institution_id=p_institution_id
        and r.key=p_assignment_type
    ) then
    raise exception 'Member is not active or does not have the selected role' using errcode='42501';
  end if;
  if p_assignment_type='teacher' and p_division_id is null then
    raise exception 'A teacher assignment requires a specific division' using errcode='22023';
  end if;
  if p_assignment_type='prefect' and (p_division_id is null or p_course_subject_id is not null) then
    raise exception 'A prefect assignment requires a division only' using errcode='22023';
  end if;
  if p_assignment_type in ('director','administrative') and p_course_subject_id is not null then
    raise exception 'Director and administrative assignments cannot target a subject' using errcode='22023';
  end if;
  if p_division_id is not null and not exists(
    select 1 from public.divisions d where d.id=p_division_id and d.institution_id=p_institution_id
  ) then raise exception 'Division does not belong to this institution' using errcode='23503'; end if;
  if p_course_subject_id is not null and not exists(
    select 1 from public.course_subjects cs where cs.id=p_course_subject_id and cs.institution_id=p_institution_id
  ) then raise exception 'Course subject does not belong to this institution' using errcode='23503'; end if;
  if p_division_id is not null and p_course_subject_id is not null and not exists(
    select 1 from public.divisions d
    join public.course_subjects cs on cs.course_id=d.course_id and cs.institution_id=d.institution_id
    where d.id=p_division_id and d.institution_id=p_institution_id and cs.id=p_course_subject_id
  ) then raise exception 'Course subject is not part of the selected division course' using errcode='23503'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_institution_id::text||':'||p_membership_id::text||':'||p_assignment_type||':'||
      coalesce(p_division_id::text,'')||':'||coalesce(p_course_subject_id::text,''),
      0
    )
  );

  select sa.id into v_id
  from public.staff_assignments sa
  where sa.institution_id=p_institution_id
    and sa.membership_id=p_membership_id
    and sa.assignment_type=p_assignment_type
    and sa.division_id is not distinct from p_division_id
    and sa.course_subject_id is not distinct from p_course_subject_id
    and (sa.ends_on is null or sa.ends_on>=current_date)
  order by sa.created_at desc
  limit 1;

  if v_id is not null then
    update public.staff_assignments
    set starts_on=v_starts_on,ends_on=p_ends_on
    where id=v_id and institution_id=p_institution_id;
    return v_id;
  end if;

  insert into public.staff_assignments(
    institution_id,membership_id,assignment_type,division_id,course_subject_id,starts_on,ends_on
  ) values (
    p_institution_id,p_membership_id,p_assignment_type,p_division_id,p_course_subject_id,v_starts_on,p_ends_on
  ) returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function private.assign_staff_to_structure_impl(uuid, uuid, text, uuid, uuid, date, date) from public, anon;
grant execute on function private.assign_staff_to_structure_impl(uuid, uuid, text, uuid, uuid, date, date) to authenticated;
