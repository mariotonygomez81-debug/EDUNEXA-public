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
