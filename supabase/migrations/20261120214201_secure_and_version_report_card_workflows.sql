alter table public.report_card_workflows
  add column version_number integer not null default 1,
  add column supersedes_workflow_id uuid,
  add column rectification_reason text;

alter table public.report_card_workflows
  drop constraint report_card_workflows_unique;

alter table public.report_card_workflows
  add constraint report_card_workflows_version_positive check (version_number >= 1),
  add constraint report_card_workflows_rectification_check check (
    (version_number = 1 and supersedes_workflow_id is null and rectification_reason is null)
    or
    (version_number > 1 and supersedes_workflow_id is not null
      and rectification_reason is not null
      and length(btrim(rectification_reason)) between 10 and 1000)
  ),
  add constraint report_card_workflows_supersedes_fk
    foreign key (supersedes_workflow_id,institution_id)
    references public.report_card_workflows(id,institution_id) on delete restrict,
  add constraint report_card_workflows_student_period_version_unique
    unique (institution_id,student_id,grading_period_id,version_number);

insert into public.permissions(key,description)
values
 ('report_cards.approve','Aprobar boletines académicos enviados por docentes'),
 ('report_cards.publish','Publicar boletines aprobados para alumnos y tutores')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='report_cards.approve'
where r.key in ('director','institution_admin') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='report_cards.publish'
where r.key='institution_admin' on conflict do nothing;

revoke all on table public.report_card_workflows from public,anon,authenticated;
revoke all on table public.report_card_workflow_events from public,anon,authenticated;
revoke all on table public.report_card_snapshots from public,anon,authenticated;
grant select on table public.report_card_workflows to authenticated;
grant select on table public.report_card_workflow_events to authenticated;
grant select on table public.report_card_snapshots to authenticated;

drop policy if exists report_card_workflows_scoped_read on public.report_card_workflows;
create policy report_card_workflows_scoped_read on public.report_card_workflows
for select to authenticated
using (
 private.can_access_student(student_id,institution_id,'grades.read')
 and (
  status='published'
  or private.has_institution_permission(institution_id,'grades.manage')
  or private.has_institution_permission(institution_id,'report_cards.approve')
  or private.has_institution_permission(institution_id,'report_cards.publish')
 )
);

drop policy if exists report_card_workflow_events_scoped_read on public.report_card_workflow_events;
create policy report_card_workflow_events_scoped_read on public.report_card_workflow_events
for select to authenticated
using (
 private.can_access_student(student_id,institution_id,'grades.read')
 and exists (
  select 1 from public.report_card_workflows w
  where w.id=workflow_id and w.institution_id=report_card_workflow_events.institution_id
   and (
    w.status='published'
    or private.has_institution_permission(w.institution_id,'grades.manage')
    or private.has_institution_permission(w.institution_id,'report_cards.approve')
    or private.has_institution_permission(w.institution_id,'report_cards.publish')
   )
 )
);

create or replace function private.submit_report_card_impl(
 p_student_id uuid,p_grading_period_id uuid,p_rectification_reason text default null
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
 v_user_id uuid := (select auth.uid());
 v_membership_id uuid;
 v_institution_id uuid;
 v_starts_on date;
 v_ends_on date;
 v_latest_id uuid;
 v_latest_status text;
 v_latest_version integer;
 v_version integer := 1;
 v_reason text;
 v_workflow_id uuid;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select st.institution_id,gp.starts_on,gp.ends_on into v_institution_id,v_starts_on,v_ends_on
 from public.students st join public.grading_periods gp on gp.institution_id=st.institution_id
 where st.id=p_student_id and gp.id=p_grading_period_id;
 if v_institution_id is null then
  raise exception 'Student or grading period not found in the same institution' using errcode='22023';
 end if;
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
$function$;

create or replace function private.approve_report_card_impl(p_workflow_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
 v_user_id uuid := (select auth.uid());
 v_membership_id uuid;
 v_institution_id uuid;
 v_student_id uuid;
 v_submitter_membership_id uuid;
 v_status text;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select institution_id,student_id,submitted_by_membership_id,status
 into v_institution_id,v_student_id,v_submitter_membership_id,v_status
 from public.report_card_workflows where id=p_workflow_id for update;
 if v_institution_id is null or v_status is distinct from 'submitted' then
  raise exception 'Only submitted report cards can be approved' using errcode='23514';
 end if;
 select m.id into v_membership_id from public.memberships m
 where m.user_id=v_user_id and m.institution_id=v_institution_id and m.status='active' limit 1;
 if v_membership_id is null
  or not private.has_institution_permission(v_institution_id,'report_cards.approve')
  or not private.can_access_student(v_student_id,v_institution_id,'grades.read') then
  raise exception 'Report card approval permission denied' using errcode='42501';
 end if;
 if v_membership_id=v_submitter_membership_id then
  raise exception 'The submitter cannot approve their own report card' using errcode='42501';
 end if;
 update public.report_card_workflows
 set status='approved',approved_by_membership_id=v_membership_id,approved_at=now()
 where id=p_workflow_id and institution_id=v_institution_id and status='submitted';
 return p_workflow_id;
end;
$function$;

create or replace function private.publish_report_card_impl(p_workflow_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
 v_user_id uuid := (select auth.uid());
 v_membership_id uuid;
 v_institution_id uuid;
 v_student_id uuid;
 v_status text;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select institution_id,student_id,status into v_institution_id,v_student_id,v_status
 from public.report_card_workflows where id=p_workflow_id for update;
 if v_institution_id is null or v_status is distinct from 'approved' then
  raise exception 'Only approved report cards can be published' using errcode='23514';
 end if;
 select m.id into v_membership_id from public.memberships m
 where m.user_id=v_user_id and m.institution_id=v_institution_id and m.status='active' limit 1;
 if v_membership_id is null
  or not private.has_institution_permission(v_institution_id,'report_cards.publish')
  or not private.can_access_student(v_student_id,v_institution_id,'grades.read') then
  raise exception 'Report card publication permission denied' using errcode='42501';
 end if;
 update public.report_card_workflows
 set status='published',published_by_membership_id=v_membership_id,published_at=now()
 where id=p_workflow_id and institution_id=v_institution_id and status='approved';
 return p_workflow_id;
end;
$function$;

revoke all on function private.submit_report_card_impl(uuid,uuid,text) from public,anon;
revoke all on function private.approve_report_card_impl(uuid) from public,anon;
revoke all on function private.publish_report_card_impl(uuid) from public,anon;
grant execute on function private.submit_report_card_impl(uuid,uuid,text) to authenticated;
grant execute on function private.approve_report_card_impl(uuid) to authenticated;
grant execute on function private.publish_report_card_impl(uuid) to authenticated;

create or replace function public.submit_report_card(p_student_id uuid,p_grading_period_id uuid,p_rectification_reason text default null)
returns uuid language sql security invoker set search_path=''
as $function$ select private.submit_report_card_impl(p_student_id,p_grading_period_id,p_rectification_reason); $function$;
create or replace function public.approve_report_card(p_workflow_id uuid)
returns uuid language sql security invoker set search_path=''
as $function$ select private.approve_report_card_impl(p_workflow_id); $function$;
create or replace function public.publish_report_card(p_workflow_id uuid)
returns uuid language sql security invoker set search_path=''
as $function$ select private.publish_report_card_impl(p_workflow_id); $function$;

revoke all on function public.submit_report_card(uuid,uuid,text) from public,anon;
revoke all on function public.approve_report_card(uuid) from public,anon;
revoke all on function public.publish_report_card(uuid) from public,anon;
grant execute on function public.submit_report_card(uuid,uuid,text) to authenticated;
grant execute on function public.approve_report_card(uuid) to authenticated;
grant execute on function public.publish_report_card(uuid) to authenticated;
