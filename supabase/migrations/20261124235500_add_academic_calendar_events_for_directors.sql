create table if not exists public.academic_calendar_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null check (category in ('jornada','feria','examen','previa','acto','reunion','feriado','otro')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  audience text not null default 'all' check (audience in ('all','staff','teachers','students','families','prefects')),
  location text,
  created_by_membership_id uuid not null references public.memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_calendar_event_dates check (ends_at is null or ends_at >= starts_at)
);
create index if not exists academic_calendar_events_institution_starts_idx on public.academic_calendar_events(institution_id, starts_at);
alter table public.academic_calendar_events enable row level security;
grant select, insert, update, delete on public.academic_calendar_events to authenticated;
drop policy if exists academic_calendar_events_member_read on public.academic_calendar_events;
create policy academic_calendar_events_member_read on public.academic_calendar_events for select to authenticated
using (exists (select 1 from public.memberships m where m.institution_id = academic_calendar_events.institution_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists academic_calendar_events_manage_insert on public.academic_calendar_events;
create policy academic_calendar_events_manage_insert on public.academic_calendar_events for insert to authenticated
with check (private.has_institution_permission(institution_id, 'academic_calendar.manage') and exists (select 1 from public.memberships m where m.id = academic_calendar_events.created_by_membership_id and m.institution_id = academic_calendar_events.institution_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists academic_calendar_events_manage_update on public.academic_calendar_events;
create policy academic_calendar_events_manage_update on public.academic_calendar_events for update to authenticated
using (private.has_institution_permission(institution_id, 'academic_calendar.manage'))
with check (private.has_institution_permission(institution_id, 'academic_calendar.manage'));
drop policy if exists academic_calendar_events_manage_delete on public.academic_calendar_events;
create policy academic_calendar_events_manage_delete on public.academic_calendar_events for delete to authenticated
using (private.has_institution_permission(institution_id, 'academic_calendar.manage'));
insert into public.permissions (key, description) values ('academic_calendar.manage', 'Administrar eventos del calendario académico')
on conflict (key) do update set description = excluded.description;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('institution_admin','director') and p.key = 'academic_calendar.manage'
on conflict do nothing;
