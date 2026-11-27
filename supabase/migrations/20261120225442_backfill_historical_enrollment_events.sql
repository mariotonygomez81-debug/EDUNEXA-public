alter table public.enrollment_events
  alter column actor_membership_id drop not null;

comment on column public.enrollment_events.actor_membership_id is
  'Authenticated staff actor for live events; NULL only for historical backfill where the original actor was not recorded.';

create or replace function private.list_student_enrollment_events_impl(
  p_institution_id uuid,
  p_student_id uuid
)
returns table(
  id uuid,
  event_type text,
  effective_on date,
  from_division_name text,
  to_division_name text,
  reason text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.students s
    where s.id=p_student_id and s.institution_id=p_institution_id
  ) then
    raise exception 'Student not found' using errcode='P0002';
  end if;

  return query
  select
    ev.id,
    ev.event_type,
    ev.effective_on,
    fd.name,
    td.name,
    ev.reason,
    coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
      case when m.id is null then 'Registro histórico' else 'Personal' end
    ),
    ev.created_at
  from public.enrollment_events ev
  left join public.divisions fd
    on fd.id=ev.from_division_id and fd.institution_id=ev.institution_id
  left join public.divisions td
    on td.id=ev.to_division_id and td.institution_id=ev.institution_id
  left join public.memberships m
    on m.id=ev.actor_membership_id and m.institution_id=ev.institution_id
  left join public.profiles p on p.id=m.user_id
  where ev.institution_id=p_institution_id
    and ev.student_id=p_student_id
  order by ev.effective_on desc,ev.created_at desc
  limit 100;
end;
$function$;

revoke all on function private.list_student_enrollment_events_impl(uuid,uuid) from public,anon,authenticated;
grant execute on function private.list_student_enrollment_events_impl(uuid,uuid) to authenticated;

insert into public.enrollment_events(
  institution_id,student_id,enrollment_id,actor_membership_id,event_type,
  effective_on,to_division_id,reason,created_at
)
select
  e.institution_id,
  e.student_id,
  e.id,
  null,
  'enrolled',
  e.enrolled_on,
  e.division_id,
  'Registro histórico anterior a la auditoría de matrículas; actor original no disponible',
  e.created_at
from public.enrollments e
where not exists (
  select 1 from public.enrollment_events ev
  where ev.institution_id=e.institution_id
    and ev.enrollment_id=e.id
    and ev.event_type='enrolled'
);
