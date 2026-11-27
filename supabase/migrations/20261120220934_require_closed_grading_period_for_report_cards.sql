CREATE OR REPLACE FUNCTION private.submit_report_card_impl(p_student_id uuid, p_grading_period_id uuid, p_rectification_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user_id uuid := (select auth.uid());
 v_membership_id uuid;
 v_institution_id uuid;
 v_starts_on date;
 v_ends_on date;
 v_period_status text;
 v_latest_id uuid;
 v_latest_status text;
 v_latest_version integer;
 v_version integer := 1;
 v_reason text;
 v_workflow_id uuid;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select st.institution_id,gp.starts_on,gp.ends_on,gp.status into v_institution_id,v_starts_on,v_ends_on,v_period_status
 from public.students st join public.grading_periods gp on gp.institution_id=st.institution_id
 where st.id=p_student_id and gp.id=p_grading_period_id;
 if v_institution_id is null then
  raise exception 'Student or grading period not found in the same institution' using errcode='22023';
 end if;
 if v_period_status is distinct from 'closed' then raise exception 'The grading period must be closed before submitting report cards' using errcode='23514'; end if;
 if v_ends_on>current_date then raise exception 'The grading period has not ended yet' using errcode='23514'; end if;

 select m.id into v_membership_id from public.memberships m
 where m.user_id=v_user_id and m.institution_id=v_institution_id and m.status='active' limit 1;
 if v_membership_id is null or not private.has_institution_permission(v_institution_id,'grades.manage') then
  raise exception 'Grade management permission required' using errcode='42501';
 end if;

 if not exists (
  select 1 from public.enrollments e
  where e.institution_id=v_institution_id and e.student_id=p_student_id
   and e.enrolled_on<=v_ends_on and (e.ended_on is null or e.ended_on>=v_starts_on)
   and private.can_manage_division(e.division_id,v_institution_id,'grades.manage')
 ) then raise exception 'Student is outside the submitter division scope' using errcode='42501'; end if;

 if not exists (
  select 1 from public.assessments a
  join public.enrollments e on e.division_id=a.division_id and e.institution_id=a.institution_id
  where a.institution_id=v_institution_id and a.grading_period_id=p_grading_period_id
   and e.student_id=p_student_id and e.enrolled_on<=v_ends_on
   and (e.ended_on is null or e.ended_on>=v_starts_on)
 ) then raise exception 'No assessments exist for this student and grading period' using errcode='23514'; end if;

 if exists (
  select 1 from public.assessments a
  join public.enrollments e on e.division_id=a.division_id and e.institution_id=a.institution_id
  where a.institution_id=v_institution_id and a.grading_period_id=p_grading_period_id
   and e.student_id=p_student_id and e.enrolled_on<=v_ends_on
   and (e.ended_on is null or e.ended_on>=v_starts_on)
   and not exists (
    select 1 from public.grade_records gr
    where gr.institution_id=a.institution_id and gr.assessment_id=a.id
     and gr.student_id=p_student_id and gr.score is not null
   )
 ) then raise exception 'Every assessment must have a recorded score before submission' using errcode='23514'; end if;

 select w.id,w.status,w.version_number into v_latest_id,v_latest_status,v_latest_version
 from public.report_card_workflows w
 where w.institution_id=v_institution_id and w.student_id=p_student_id
  and w.grading_period_id=p_grading_period_id
 order by w.version_number desc limit 1 for update;

 if v_latest_id is not null then
  if v_latest_status<>'published' then
   raise exception 'A report card workflow is already in progress' using errcode='23505';
  end if;
  v_reason:=nullif(btrim(p_rectification_reason),'');
  if v_reason is null or length(v_reason)<10 or length(v_reason)>1000 then
   raise exception 'A rectification reason between 10 and 1000 characters is required' using errcode='22023';
  end if;
  v_version:=v_latest_version+1;
 elsif p_rectification_reason is not null then
  raise exception 'A rectification reason is only valid for a previously published report card' using errcode='22023';
 end if;

 insert into public.report_card_workflows(
  institution_id,student_id,grading_period_id,status,submitted_by_membership_id,submitted_at,
  version_number,supersedes_workflow_id,rectification_reason
 ) values (
  v_institution_id,p_student_id,p_grading_period_id,'submitted',v_membership_id,now(),
  v_version,v_latest_id,v_reason
 ) returning id into v_workflow_id;
 return v_workflow_id;
end;
$function$
;