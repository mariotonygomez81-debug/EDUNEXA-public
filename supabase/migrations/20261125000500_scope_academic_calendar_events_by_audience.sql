create or replace function private.can_read_academic_calendar_audience(
  p_institution_id uuid,
  p_audience text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    where m.institution_id = p_institution_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        p_audience = 'all'
        or exists (
          select 1
          from public.membership_roles mr
          join public.roles r on r.id = mr.role_id
          where mr.membership_id = m.id
            and mr.institution_id = m.institution_id
            and (
              (p_audience = 'staff' and r.key = any (array[
                'institution_admin','director','administrative','secretary','teacher','prefect'
              ]::text[]))
              or (p_audience = 'teachers' and r.key = 'teacher')
              or (p_audience = 'students' and r.key = 'student')
              or (p_audience = 'families' and r.key = 'guardian')
              or (p_audience = 'prefects' and r.key = 'prefect')
            )
        )
      )
  );
$function$;

revoke all on function private.can_read_academic_calendar_audience(uuid, text) from public;
grant execute on function private.can_read_academic_calendar_audience(uuid, text) to authenticated;

drop policy if exists academic_calendar_events_member_read on public.academic_calendar_events;
create policy academic_calendar_events_member_read
  on public.academic_calendar_events for select to authenticated
  using (private.can_read_academic_calendar_audience(institution_id, audience));
