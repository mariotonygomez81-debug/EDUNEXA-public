
alter table public.grading_periods
  add column status text not null default 'open',
  add column closed_at timestamptz,
  add column closed_by_membership_id uuid,
  add column close_reason text,
  add constraint grading_periods_status_check check (status in ('open','closed')),
  add constraint grading_periods_closure_state_check check (
    (status='open' and closed_at is null and closed_by_membership_id is null and close_reason is null)
    or
    (status='closed' and closed_at is not null and closed_by_membership_id is not null
      and close_reason is not null and length(btrim(close_reason)) between 10 and 500)
  ),
  add constraint grading_periods_closed_by_fk
    foreign key (closed_by_membership_id,institution_id)
    references public.memberships(id,institution_id) on delete restrict;

create table public.grade_record_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  assessment_id uuid not null,
  student_id uuid not null,
  actor_membership_id uuid not null,
  action text not null check (action in ('created','updated','cleared')),
  old_score numeric,
  new_score numeric,
  old_comment text,
  new_comment text,
  change_reason text,
  created_at timestamptz not null default now(),
  constraint grade_record_events_assessment_fk
    foreign key (assessment_id,institution_id) references public.assessments(id,institution_id) on delete restrict,
  constraint grade_record_events_student_fk
    foreign key (student_id,institution_id) references public.students(id,institution_id) on delete restrict,
  constraint grade_record_events_actor_fk
    foreign key (actor_membership_id,institution_id) references public.memberships(id,institution_id) on delete restrict,
  constraint grade_record_events_reason_check check (
    (action='created' and (change_reason is null or length(btrim(change_reason)) between 10 and 500))
    or
    (action in ('updated','cleared') and change_reason is not null
      and length(btrim(change_reason)) between 10 and 500)
  )
);

create table public.grading_period_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  grading_period_id uuid not null,
  actor_membership_id uuid not null,
  from_status text not null check (from_status in ('open','closed')),
  to_status text not null check (to_status in ('open','closed')),
  reason text not null check (length(btrim(reason)) between 10 and 500),
  created_at timestamptz not null default now(),
  constraint grading_period_events_period_fk
    foreign key (grading_period_id,institution_id) references public.grading_periods(id,institution_id) on delete restrict,
  constraint grading_period_events_actor_fk
    foreign key (actor_membership_id,institution_id) references public.memberships(id,institution_id) on delete restrict,
  constraint grading_period_events_transition_check check (from_status<>to_status)
);

create index grading_periods_closed_by_scope_idx
  on public.grading_periods(closed_by_membership_id,institution_id);
create index grade_record_events_student_history_idx
  on public.grade_record_events(institution_id,student_id,created_at desc);
create index grade_record_events_assessment_idx
  on public.grade_record_events(institution_id,assessment_id,created_at desc);
create index grading_period_events_period_history_idx
  on public.grading_period_events(institution_id,grading_period_id,created_at desc);

alter table public.grade_record_events enable row level security;
alter table public.grading_period_events enable row level security;

revoke all on table public.grade_record_events from public,anon,authenticated;
grant select on table public.grade_record_events to authenticated;
create policy grade_record_events_scoped_read on public.grade_record_events
for select to authenticated
using (
  private.can_access_student(student_id,institution_id,'grades.read')
  and private.has_institution_permission(institution_id,'grades.manage')
);

revoke all on table public.grading_period_events from public,anon,authenticated;
grant select on table public.grading_period_events to authenticated;
create policy grading_period_events_staff_read on public.grading_period_events
for select to authenticated
using (
  private.has_institution_permission(institution_id,'grades.close_period')
  or private.has_institution_permission(institution_id,'grades.reopen_period')
);

insert into public.permissions(key,description)
values
 ('grades.close_period','Cerrar períodos de calificación'),
 ('grades.reopen_period','Reabrir períodos de calificación para correcciones')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='grades.close_period'
where r.key in ('institution_admin','director') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='grades.reopen_period'
where r.key='institution_admin' on conflict do nothing;

alter table public.grade_records
  add constraint grade_records_score_nonnegative_check check (score is null or score>=0);

revoke all on table public.grade_records from public,anon,authenticated;
grant select on table public.grade_records to authenticated;

revoke all on table public.grading_periods from public,anon,authenticated;
grant select on table public.grading_periods to authenticated;
grant insert (institution_id,academic_year_id,name,starts_on,ends_on,sort_order)
  on table public.grading_periods to authenticated;

create or replace function private.guard_assessment_period_open()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_status text;
begin
  if tg_op<>'INSERT' then
    select status into v_status from public.grading_periods
    where id=old.grading_period_id and institution_id=old.institution_id;
    if v_status is distinct from 'open' then
      raise exception 'Assessments in a closed grading period cannot be changed' using errcode='23514';
    end if;
  end if;
  if tg_op<>'DELETE' then
    select status into v_status from public.grading_periods
    where id=new.grading_period_id and institution_id=new.institution_id;
    if v_status is distinct from 'open' then
      raise exception 'Assessments can only be created or moved into an open grading period' using errcode='23514';
    end if;
    return new;
  end if;
  return old;
end;
$function$;

create trigger assessments_guard_period_open
before insert or update or delete on public.assessments
for each row execute function private.guard_assessment_period_open();

create or replace function private.save_grade_records_batch_impl(
  p_assessment_id uuid,p_rows jsonb,p_change_reason text default null
)
returns integer language plpgsql security definer set search_path=''
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

  select a.id,a.institution_id,a.division_id,a.grading_period_id,a.max_score,
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
    or not private.can_manage_division(v_assessment.division_id,v_assessment.institution_id,'grades.manage') then
    raise exception 'Grade management permission denied for this division' using errcode='42501';
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

create or replace function private.close_grading_period_impl(p_grading_period_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_institution_id uuid;
  v_starts_on date;
  v_ends_on date;
  v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'A closure reason between 10 and 500 characters is required' using errcode='22023';
  end if;
  select institution_id,starts_on,ends_on,status into v_institution_id,v_starts_on,v_ends_on,v_status
  from public.grading_periods where id=p_grading_period_id for update;
  if v_institution_id is null then raise exception 'Grading period not found' using errcode='P0002'; end if;
  if v_status<>'open' then raise exception 'Only open grading periods can be closed' using errcode='23514'; end if;
  if v_ends_on>current_date then raise exception 'The grading period has not ended yet' using errcode='23514'; end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=v_user_id and m.institution_id=v_institution_id and m.status='active'
  limit 1;
  if v_membership_id is null
    or not private.has_institution_permission(v_institution_id,'grades.close_period') then
    raise exception 'Period closure permission denied' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.assessments a
    where a.institution_id=v_institution_id and a.grading_period_id=p_grading_period_id
  ) then raise exception 'The period has no assessments' using errcode='23514'; end if;

  if exists (
    select 1
    from public.assessments a
    join public.enrollments e on e.institution_id=a.institution_id and e.division_id=a.division_id
    where a.institution_id=v_institution_id and a.grading_period_id=p_grading_period_id
      and e.enrolled_on<=v_ends_on and (e.ended_on is null or e.ended_on>=v_starts_on)
      and not exists (
        select 1 from public.grade_records gr
        where gr.institution_id=a.institution_id and gr.assessment_id=a.id
          and gr.student_id=e.student_id and gr.score is not null
      )
  ) then raise exception 'Every enrolled student must have a score for every assessment before closure' using errcode='23514'; end if;

  update public.grading_periods
  set status='closed',closed_at=now(),closed_by_membership_id=v_membership_id,close_reason=btrim(p_reason)
  where id=p_grading_period_id and institution_id=v_institution_id;
  insert into public.grading_period_events(
    institution_id,grading_period_id,actor_membership_id,from_status,to_status,reason
  ) values (v_institution_id,p_grading_period_id,v_membership_id,'open','closed',btrim(p_reason));
  return p_grading_period_id;
end;
$function$;

create or replace function private.reopen_grading_period_impl(p_grading_period_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_institution_id uuid;
  v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'A reopening reason between 10 and 500 characters is required' using errcode='22023';
  end if;
  select institution_id,status into v_institution_id,v_status
  from public.grading_periods where id=p_grading_period_id for update;
  if v_institution_id is null then raise exception 'Grading period not found' using errcode='P0002'; end if;
  if v_status<>'closed' then raise exception 'Only closed grading periods can be reopened' using errcode='23514'; end if;
  if exists (
    select 1 from public.report_card_workflows w
    where w.institution_id=v_institution_id and w.grading_period_id=p_grading_period_id
      and w.status in ('submitted','approved')
  ) then raise exception 'Resolve the pending report card workflow before reopening the period' using errcode='23514'; end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=v_user_id and m.institution_id=v_institution_id and m.status='active'
  limit 1;
  if v_membership_id is null
    or not private.has_institution_permission(v_institution_id,'grades.reopen_period') then
    raise exception 'Period reopening permission denied' using errcode='42501';
  end if;

  update public.grading_periods
  set status='open',closed_at=null,closed_by_membership_id=null,close_reason=null
  where id=p_grading_period_id and institution_id=v_institution_id;
  insert into public.grading_period_events(
    institution_id,grading_period_id,actor_membership_id,from_status,to_status,reason
  ) values (v_institution_id,p_grading_period_id,v_membership_id,'closed','open',btrim(p_reason));
  return p_grading_period_id;
end;
$function$;

revoke all on function private.save_grade_records_batch_impl(uuid,jsonb,text) from public,anon;
revoke all on function private.close_grading_period_impl(uuid,text) from public,anon;
revoke all on function private.reopen_grading_period_impl(uuid,text) from public,anon;
grant execute on function private.save_grade_records_batch_impl(uuid,jsonb,text) to authenticated;
grant execute on function private.close_grading_period_impl(uuid,text) to authenticated;
grant execute on function private.reopen_grading_period_impl(uuid,text) to authenticated;

create or replace function public.save_grade_records_batch(p_assessment_id uuid,p_rows jsonb,p_change_reason text default null)
returns integer language sql security invoker set search_path=''
as $function$ select private.save_grade_records_batch_impl(p_assessment_id,p_rows,p_change_reason); $function$;
create or replace function public.close_grading_period(p_grading_period_id uuid,p_reason text)
returns uuid language sql security invoker set search_path=''
as $function$ select private.close_grading_period_impl(p_grading_period_id,p_reason); $function$;
create or replace function public.reopen_grading_period(p_grading_period_id uuid,p_reason text)
returns uuid language sql security invoker set search_path=''
as $function$ select private.reopen_grading_period_impl(p_grading_period_id,p_reason); $function$;

revoke all on function public.save_grade_records_batch(uuid,jsonb,text) from public,anon;
revoke all on function public.close_grading_period(uuid,text) from public,anon;
revoke all on function public.reopen_grading_period(uuid,text) from public,anon;
grant execute on function public.save_grade_records_batch(uuid,jsonb,text) to authenticated;
grant execute on function public.close_grading_period(uuid,text) to authenticated;
grant execute on function public.reopen_grading_period(uuid,text) to authenticated;
