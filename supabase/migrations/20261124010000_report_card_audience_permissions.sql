-- Separate report-card visibility from general grade access.
alter table public.student_guardians
  add column if not exists can_view_report_cards boolean not null default false;

alter table public.report_card_workflows
  add column if not exists publication_audience text not null default 'both'
  check (publication_audience in ('student','guardian','both'));

create or replace function private.can_view_report_card(
  p_student_id uuid,
  p_institution_id uuid,
  p_audience text
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    where m.user_id=(select auth.uid())
      and m.institution_id=p_institution_id
      and m.status='active'
      and (
        (
          r.key='student'
          and p_audience in ('student','both')
          and exists (
            select 1 from public.student_memberships sm
            where sm.membership_id=m.id
              and sm.institution_id=p_institution_id
              and sm.student_id=p_student_id
          )
        )
        or (
          r.key='guardian'
          and p_audience in ('guardian','both')
          and exists (
            select 1
            from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id=g.id and sg.institution_id=g.institution_id
            where g.membership_id=m.id
              and g.institution_id=p_institution_id
              and sg.student_id=p_student_id
              and sg.can_view_report_cards
          )
        )
        or (
          r.key not in ('student','guardian')
          and private.can_access_student(p_student_id,p_institution_id,'grades.read')
        )
      )
  );
$function$;

revoke all on function private.can_view_report_card(uuid,uuid,text) from public,anon;
grant execute on function private.can_view_report_card(uuid,uuid,text) to authenticated;

-- The immutable snapshot receives the audience at the same transaction as publication.
create or replace function private.apply_report_card_snapshot_audience()
returns trigger language plpgsql set search_path = ''
as $function$
declare
  v_audience text;
begin
  select w.publication_audience into v_audience
  from public.report_card_workflows w
  where w.id=new.workflow_id and w.institution_id=new.institution_id
    and w.status='published';
  if v_audience is null then
    raise exception 'Published workflow audience is missing';
  end if;
  new.snapshot := jsonb_set(coalesce(new.snapshot,'{}'::jsonb),'{publication_audience}',to_jsonb(v_audience),true);
  return new;
end;
$function$;
revoke all on function private.apply_report_card_snapshot_audience() from public,anon,authenticated;
drop trigger if exists report_card_snapshot_audience on public.report_card_snapshots;
create trigger report_card_snapshot_audience
before insert on public.report_card_snapshots
for each row execute function private.apply_report_card_snapshot_audience();

drop policy if exists "Students and authorized staff can read published report snapshots" on public.report_card_snapshots;
drop policy if exists report_card_snapshots_scoped_read on public.report_card_snapshots;
create policy report_card_snapshots_scoped_read on public.report_card_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.report_card_workflows w
    where w.id=workflow_id
      and w.institution_id=report_card_snapshots.institution_id
      and w.status='published'
      and private.can_view_report_card(
        report_card_snapshots.student_id,
        report_card_snapshots.institution_id,
        w.publication_audience
      )
  )
);

drop policy if exists report_card_workflows_scoped_read on public.report_card_workflows;
create policy report_card_workflows_scoped_read on public.report_card_workflows
for select to authenticated
using (
  (
    status='published'
    and private.can_view_report_card(student_id,institution_id,publication_audience)
  )
  or (
    private.can_access_student(student_id,institution_id,'grades.read')
    and (
      private.has_institution_permission(institution_id,'grades.manage')
      or private.has_institution_permission(institution_id,'report_cards.approve')
      or private.has_institution_permission(institution_id,'report_cards.publish')
    )
  )
);

drop policy if exists report_card_workflow_events_scoped_read on public.report_card_workflow_events;
create policy report_card_workflow_events_scoped_read on public.report_card_workflow_events
for select to authenticated
using (
  exists (
    select 1 from public.report_card_workflows w
    where w.id=workflow_id
      and w.institution_id=report_card_workflow_events.institution_id
      and (
        (w.status='published' and private.can_view_report_card(
          w.student_id,w.institution_id,w.publication_audience
        ))
        or (
          private.can_access_student(w.student_id,w.institution_id,'grades.read')
          and (
            private.has_institution_permission(w.institution_id,'grades.manage')
            or private.has_institution_permission(w.institution_id,'report_cards.approve')
            or private.has_institution_permission(w.institution_id,'report_cards.publish')
          )
        )
      )
  )
);

create or replace function public.set_report_card_publication_audience(
  p_workflow_id uuid,
  p_audience text
) returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_institution_id uuid;
  v_student_id uuid;
  v_status text;
begin
  if p_audience not in ('student','guardian','both') then
    raise exception 'Invalid report card audience' using errcode='22023';
  end if;
  select institution_id,student_id,status
    into v_institution_id,v_student_id,v_status
  from public.report_card_workflows
  where id=p_workflow_id
  for update;
  if v_institution_id is null or v_status <> 'approved' then
    raise exception 'Only approved report cards can change publication audience' using errcode='23514';
  end if;
  if not private.has_institution_permission(v_institution_id,'report_cards.publish')
     or not private.can_access_student(v_student_id,v_institution_id,'grades.read') then
    raise exception 'Report card publication permission denied' using errcode='42501';
  end if;
  update public.report_card_workflows
    set publication_audience=p_audience
  where id=p_workflow_id and institution_id=v_institution_id and status='approved';
end;
$function$;
revoke all on function public.set_report_card_publication_audience(uuid,text) from public,anon;
grant execute on function public.set_report_card_publication_audience(uuid,text) to authenticated;


-- Keep dashboard counts private too: only count report cards visible to this exact account.
create or replace function public.list_my_portal_students(p_institution_id uuid)
returns table(
  student_id uuid,
  first_name text,
  last_name text,
  student_number text,
  is_self boolean,
  division_id uuid,
  division_name text,
  course_name text,
  academic_year_id uuid,
  academic_year_name text,
  enrollment_status text,
  can_view_grades boolean,
  can_view_attendance boolean,
  attendance_present integer,
  attendance_absent integer,
  attendance_late integer,
  attendance_justified integer,
  attendance_early_departure integer,
  attendance_total integer,
  last_attendance_on date,
  published_report_card_count integer,
  latest_report_card_at timestamptz
)
language sql stable set search_path = ''
as $function$
  select
    p.student_id,p.first_name,p.last_name,p.student_number,p.is_self,
    p.division_id,p.division_name,p.course_name,p.academic_year_id,
    p.academic_year_name,p.enrollment_status,p.can_view_grades,
    p.can_view_attendance,p.attendance_present,p.attendance_absent,
    p.attendance_late,p.attendance_justified,p.attendance_early_departure,
    p.attendance_total,p.last_attendance_on,
    case when exists (
      select 1 from public.report_card_workflows w
      where w.institution_id=p_institution_id
        and w.student_id=p.student_id
        and w.status='published'
        and private.can_view_report_card(w.student_id,w.institution_id,w.publication_audience)
    ) then (
      select count(*)::integer from public.report_card_workflows w
      where w.institution_id=p_institution_id
        and w.student_id=p.student_id
        and w.status='published'
        and private.can_view_report_card(w.student_id,w.institution_id,w.publication_audience)
    ) else 0 end,
    (
      select max(w.published_at) from public.report_card_workflows w
      where w.institution_id=p_institution_id
        and w.student_id=p.student_id
        and w.status='published'
        and private.can_view_report_card(w.student_id,w.institution_id,w.publication_audience)
    )
  from private.list_my_portal_students_impl(p_institution_id) p;
$function$;
revoke all on function public.list_my_portal_students(uuid) from public,anon;
grant execute on function public.list_my_portal_students(uuid) to authenticated;


-- Publish the selected audience and create the immutable snapshot in one transaction.
create or replace function public.publish_report_card_with_audience(
  p_workflow_id uuid,
  p_audience text
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_institution_id uuid;
  v_student_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_audience not in ('student','guardian','both') then
    raise exception 'Invalid report card audience' using errcode='22023';
  end if;

  select institution_id,student_id,status
    into v_institution_id,v_student_id,v_status
  from public.report_card_workflows
  where id=p_workflow_id
  for update;

  if v_institution_id is null or v_status is distinct from 'approved' then
    raise exception 'Only approved report cards can be published' using errcode='23514';
  end if;
  if not private.has_institution_permission(v_institution_id,'report_cards.publish')
     or not private.can_access_student(v_student_id,v_institution_id,'grades.read') then
    raise exception 'Report card publication permission denied' using errcode='42501';
  end if;

  update public.report_card_workflows
    set publication_audience=p_audience
  where id=p_workflow_id and institution_id=v_institution_id and status='approved';

  return private.publish_report_card_impl(p_workflow_id);
end;
$function$;
revoke all on function public.publish_report_card_with_audience(uuid,text) from public,anon;
grant execute on function public.publish_report_card_with_audience(uuid,text) to authenticated;


-- Restrict student/staff conversations to teachers of an actual classroom
-- in the student's active division; keep the separate previous-subject path.
create or replace function private.is_staff_assigned_to_student_classroom(
  p_student_membership_id uuid,
  p_staff_membership_id uuid,
  p_institution_id uuid
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.student_memberships sm
    join public.enrollments e
      on e.student_id=sm.student_id
      and e.institution_id=sm.institution_id
    join public.virtual_classrooms vc
      on vc.institution_id=e.institution_id
      and vc.division_id=e.division_id
    join public.staff_assignments sa
      on sa.membership_id=p_staff_membership_id
      and sa.institution_id=vc.institution_id
      and sa.assignment_type='teacher'
      and sa.division_id=vc.division_id
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
      and (
        sa.course_subject_id is null
        or (vc.course_subject_id is not null and sa.course_subject_id=vc.course_subject_id)
      )
    where sm.membership_id=p_student_membership_id
      and sm.institution_id=p_institution_id
      and e.status='active'
      and e.enrolled_on<=current_date
      and (e.ended_on is null or e.ended_on>=current_date)
  );
$function$;
revoke all on function private.is_staff_assigned_to_student_classroom(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function private.can_message_members(
  p_institution_id uuid,
  p_sender_membership_id uuid,
  p_recipient_membership_id uuid
) returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_sender_roles text[];
  v_recipient_roles text[];
  v_sender_admin boolean;
  v_sender_staff boolean;
  v_sender_student boolean;
  v_sender_guardian boolean;
  v_recipient_admin boolean;
  v_recipient_staff boolean;
  v_recipient_student boolean;
  v_recipient_guardian boolean;
begin
  if p_institution_id is null or p_sender_membership_id is null
    or p_recipient_membership_id is null
    or p_sender_membership_id=p_recipient_membership_id then
    return false;
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.id=p_sender_membership_id and m.institution_id=p_institution_id and m.status='active'
  ) or not exists (
    select 1 from public.memberships m
    where m.id=p_recipient_membership_id and m.institution_id=p_institution_id and m.status='active'
  ) then
    return false;
  end if;

  select coalesce(array_agg(r.key),array[]::text[]) into v_sender_roles
  from public.membership_roles mr join public.roles r on r.id=mr.role_id
  where mr.membership_id=p_sender_membership_id and mr.institution_id=p_institution_id;

  select coalesce(array_agg(r.key),array[]::text[]) into v_recipient_roles
  from public.membership_roles mr join public.roles r on r.id=mr.role_id
  where mr.membership_id=p_recipient_membership_id and mr.institution_id=p_institution_id;

  v_sender_admin:=v_sender_roles && array['institution_admin','director','administrative'];
  v_sender_staff:=v_sender_roles && array['teacher','prefect'];
  v_sender_student:='student'=any(v_sender_roles);
  v_sender_guardian:='guardian'=any(v_sender_roles);
  v_recipient_admin:=v_recipient_roles && array['institution_admin','director','administrative'];
  v_recipient_staff:=v_recipient_roles && array['teacher','prefect'];
  v_recipient_student:='student'=any(v_recipient_roles);
  v_recipient_guardian:='guardian'=any(v_recipient_roles);

  if v_sender_admin or v_recipient_admin then return true; end if;
  if v_sender_staff and v_recipient_staff then return true; end if;

  -- Symmetric scope: staff can contact a student only if the student
  -- has a current enrollment in a classroom assigned to that teacher.
  if v_sender_staff and v_recipient_student then
    return private.is_staff_assigned_to_student_classroom(
      p_recipient_membership_id,p_sender_membership_id,p_institution_id
    );
  end if;

  -- Guardian-to-staff communication retains its linked-student division scope.
  if v_sender_staff and v_recipient_guardian then
    return exists (
      select 1 from public.enrollments e
      where e.institution_id=p_institution_id and e.status='active'
        and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
        and exists (
          select 1 from public.guardians g
          join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
          where g.membership_id=p_recipient_membership_id
            and g.institution_id=p_institution_id and sg.student_id=e.student_id
        )
        and private.is_staff_assigned_to_division(
          p_sender_membership_id,p_institution_id,e.division_id
        )
    );
  end if;

  if v_sender_student and v_recipient_staff then
    if private.is_staff_assigned_to_student_classroom(
      p_sender_membership_id,p_recipient_membership_id,p_institution_id
    ) then
      return true;
    end if;
    return private.is_staff_assigned_to_previous_subject(
      p_sender_membership_id,p_recipient_membership_id,p_institution_id
    );
  end if;

  if v_sender_guardian and v_recipient_staff then
    return exists (
      select 1 from public.enrollments e
      where e.institution_id=p_institution_id and e.status='active'
        and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
        and exists (
          select 1 from public.guardians g
          join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
          where g.membership_id=p_sender_membership_id
            and g.institution_id=p_institution_id and sg.student_id=e.student_id
        )
        and private.is_staff_assigned_to_division(
          p_recipient_membership_id,p_institution_id,e.division_id
        )
    );
  end if;

  return false;
end;
$function$;
revoke all on function private.can_message_members(uuid,uuid,uuid) from public,anon,authenticated;
