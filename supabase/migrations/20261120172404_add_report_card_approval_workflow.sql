-- Workflow de revisión, aprobación y publicación de boletines por alumno y período.
create table if not exists public.report_card_workflows (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  student_id uuid not null,
  grading_period_id uuid not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','published')),
  submitted_by_membership_id uuid,
  submitted_at timestamptz,
  approved_by_membership_id uuid,
  approved_at timestamptz,
  published_by_membership_id uuid,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint report_card_workflows_unique unique (institution_id, student_id, grading_period_id),
  constraint report_card_workflows_id_institution_unique unique (id, institution_id),
  constraint report_card_workflows_status_timestamps_check check (
    (status = 'draft' and submitted_at is null and approved_at is null and published_at is null)
    or (status = 'submitted' and submitted_at is not null and approved_at is null and published_at is null)
    or (status = 'approved' and submitted_at is not null and approved_at is not null and published_at is null)
    or (status = 'published' and submitted_at is not null and approved_at is not null and published_at is not null)
  ),
  constraint report_card_workflows_student_fk foreign key (student_id, institution_id)
    references public.students(id, institution_id) on delete cascade,
  constraint report_card_workflows_period_fk foreign key (grading_period_id, institution_id)
    references public.grading_periods(id, institution_id) on delete cascade,
  constraint report_card_workflows_submitter_fk foreign key (submitted_by_membership_id, institution_id)
    references public.memberships(id, institution_id),
  constraint report_card_workflows_approver_fk foreign key (approved_by_membership_id, institution_id)
    references public.memberships(id, institution_id),
  constraint report_card_workflows_publisher_fk foreign key (published_by_membership_id, institution_id)
    references public.memberships(id, institution_id)
);

create table if not exists public.report_card_workflow_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  workflow_id uuid not null,
  student_id uuid not null,
  grading_period_id uuid not null,
  from_status text,
  to_status text not null check (to_status in ('draft','submitted','approved','published')),
  actor_membership_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  constraint report_card_workflow_events_workflow_fk foreign key (workflow_id, institution_id)
    references public.report_card_workflows(id, institution_id) on delete cascade,
  constraint report_card_workflow_events_actor_fk foreign key (actor_membership_id, institution_id)
    references public.memberships(id, institution_id)
);

create index if not exists report_card_workflows_student_period_idx
  on public.report_card_workflows(institution_id, student_id, grading_period_id);
create index if not exists report_card_workflow_events_workflow_idx
  on public.report_card_workflow_events(workflow_id, created_at desc);

alter table public.report_card_workflows enable row level security;
alter table public.report_card_workflow_events enable row level security;

drop policy if exists report_card_workflows_scoped_read on public.report_card_workflows;
create policy report_card_workflows_scoped_read on public.report_card_workflows
  for select to authenticated
  using (private.can_access_student(student_id, institution_id, 'grades.read'));

drop policy if exists report_card_workflows_teacher_submit on public.report_card_workflows;
create policy report_card_workflows_teacher_submit on public.report_card_workflows
  for insert to authenticated
  with check (
    status = 'submitted'
    and submitted_at is not null
    and submitted_by_membership_id in (
      select m.id from public.memberships m
      where m.user_id = (select auth.uid()) and m.institution_id = report_card_workflows.institution_id and m.status = 'active'
    )
    and exists (
      select 1 from public.enrollments e
      where e.institution_id = report_card_workflows.institution_id
        and e.student_id = report_card_workflows.student_id
        and e.enrolled_on <= (
          select gp.ends_on from public.grading_periods gp
          where gp.id = report_card_workflows.grading_period_id
            and gp.institution_id = report_card_workflows.institution_id
        )
        and (e.ended_on is null or e.ended_on >= (
          select gp.starts_on from public.grading_periods gp
          where gp.id = report_card_workflows.grading_period_id
            and gp.institution_id = report_card_workflows.institution_id
        ))
        and private.can_manage_division(e.division_id, e.institution_id, 'grades.manage')
    )
  );

drop policy if exists report_card_workflows_admin_update on public.report_card_workflows;
create policy report_card_workflows_admin_update on public.report_card_workflows
  for update to authenticated
  using (private.has_institution_permission(institution_id, 'institution.manage'))
  with check (
    private.has_institution_permission(institution_id, 'institution.manage')
    and status in ('approved','published')
  );

drop policy if exists report_card_workflow_events_scoped_read on public.report_card_workflow_events;
create policy report_card_workflow_events_scoped_read on public.report_card_workflow_events
  for select to authenticated
  using (private.can_access_student(student_id, institution_id, 'grades.read'));

create or replace function private.enforce_report_card_workflow_transition()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.status is distinct from new.status then
    if not (
      (old.status = 'submitted' and new.status = 'approved')
      or (old.status = 'approved' and new.status = 'published')
    ) then
      raise exception 'Invalid report card workflow transition: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists report_card_workflow_transition_trigger on public.report_card_workflows;
create trigger report_card_workflow_transition_trigger
  before update of status on public.report_card_workflows
  for each row execute function private.enforce_report_card_workflow_transition();

revoke all on function private.enforce_report_card_workflow_transition() from public, anon, authenticated;

create or replace function private.log_report_card_workflow_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_membership_id uuid;
begin
  select m.id into v_membership_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.institution_id = new.institution_id
    and m.status = 'active'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active institution membership required for workflow changes';
  end if;

  if tg_op = 'INSERT' then
    insert into public.report_card_workflow_events (
      institution_id, workflow_id, student_id, grading_period_id,
      from_status, to_status, actor_membership_id
    ) values (
      new.institution_id, new.id, new.student_id, new.grading_period_id,
      null, new.status, v_membership_id
    );
  elsif old.status is distinct from new.status then
    insert into public.report_card_workflow_events (
      institution_id, workflow_id, student_id, grading_period_id,
      from_status, to_status, actor_membership_id
    ) values (
      new.institution_id, new.id, new.student_id, new.grading_period_id,
      old.status, new.status, v_membership_id
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists report_card_workflow_event_trigger on public.report_card_workflows;
create trigger report_card_workflow_event_trigger
  after insert or update of status on public.report_card_workflows
  for each row execute function private.log_report_card_workflow_event();

revoke all on function private.log_report_card_workflow_event() from public, anon, authenticated;
revoke update, delete on public.report_card_workflow_events from authenticated;
grant select on public.report_card_workflow_events to authenticated;
revoke update on public.report_card_workflows from authenticated;
grant update (status, approved_by_membership_id, approved_at, published_by_membership_id, published_at, updated_at)
  on public.report_card_workflows to authenticated;
grant select, insert on public.report_card_workflows to authenticated;
