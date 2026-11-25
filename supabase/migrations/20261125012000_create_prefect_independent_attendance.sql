-- Independent attendance register for prefect staff.
create table if not exists public.prefect_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  division_id uuid not null,
  held_on date not null,
  period_label text,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id,institution_id),
  foreign key (division_id,institution_id)
    references public.divisions(id,institution_id) on delete cascade
);
create unique index if not exists prefect_attendance_sessions_unique_period
  on public.prefect_attendance_sessions(institution_id,division_id,held_on,coalesce(period_label,''));
create index if not exists prefect_attendance_sessions_date_idx
  on public.prefect_attendance_sessions(institution_id,division_id,held_on desc);

create table if not exists public.prefect_attendance_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status text not null check (status in ('present','absent','late','justified','early_departure')),
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (institution_id,session_id,student_id),
  foreign key (session_id,institution_id)
    references public.prefect_attendance_sessions(id,institution_id) on delete cascade,
  foreign key (student_id,institution_id)
    references public.students(id,institution_id) on delete restrict
);
create index if not exists prefect_attendance_records_student_idx
  on public.prefect_attendance_records(institution_id,student_id);

alter table public.prefect_attendance_sessions enable row level security;
alter table public.prefect_attendance_records enable row level security;
revoke all on public.prefect_attendance_sessions, public.prefect_attendance_records from anon,authenticated;
grant select on public.prefect_attendance_sessions, public.prefect_attendance_records to authenticated;
grant insert(institution_id,division_id,held_on,period_label,created_by)
  on public.prefect_attendance_sessions to authenticated;
grant update(status) on public.prefect_attendance_sessions to authenticated;
grant insert(institution_id,session_id,student_id,status,note,recorded_by,recorded_at)
  on public.prefect_attendance_records to authenticated;
grant update(status,note,recorded_by,recorded_at)
  on public.prefect_attendance_records to authenticated;

drop policy if exists prefect_attendance_sessions_read on public.prefect_attendance_sessions;
create policy prefect_attendance_sessions_read on public.prefect_attendance_sessions
for select to authenticated
using (private.can_manage_division(division_id,institution_id,'attendance.manage'));
drop policy if exists prefect_attendance_sessions_insert on public.prefect_attendance_sessions;
create policy prefect_attendance_sessions_insert on public.prefect_attendance_sessions
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and private.can_manage_division(division_id,institution_id,'attendance.manage')
);
drop policy if exists prefect_attendance_sessions_update on public.prefect_attendance_sessions;
create policy prefect_attendance_sessions_update on public.prefect_attendance_sessions
for update to authenticated
using (private.can_manage_division(division_id,institution_id,'attendance.manage'))
with check (private.can_manage_division(division_id,institution_id,'attendance.manage'));

drop policy if exists prefect_attendance_records_read on public.prefect_attendance_records;
create policy prefect_attendance_records_read on public.prefect_attendance_records
for select to authenticated
using (
  exists (
    select 1 from public.prefect_attendance_sessions s
    where s.id=prefect_attendance_records.session_id
      and s.institution_id=prefect_attendance_records.institution_id
      and private.can_manage_division(s.division_id,s.institution_id,'attendance.manage')
  )
);
drop policy if exists prefect_attendance_records_write on public.prefect_attendance_records;
create policy prefect_attendance_records_write on public.prefect_attendance_records
for all to authenticated
using (
  exists (
    select 1 from public.prefect_attendance_sessions s
    where s.id=prefect_attendance_records.session_id
      and s.institution_id=prefect_attendance_records.institution_id
      and s.status='open'
      and private.can_manage_division(s.division_id,s.institution_id,'attendance.manage')
  )
)
with check (
  exists (
    select 1 from public.prefect_attendance_sessions s
    where s.id=prefect_attendance_records.session_id
      and s.institution_id=prefect_attendance_records.institution_id
      and s.status='open'
      and private.can_manage_division(s.division_id,s.institution_id,'attendance.manage')
  )
  and exists (
    select 1 from public.enrollments e
    join public.prefect_attendance_sessions s on s.id=prefect_attendance_records.session_id
      and s.institution_id=prefect_attendance_records.institution_id
    where e.institution_id=prefect_attendance_records.institution_id
      and e.division_id=s.division_id
      and e.student_id=prefect_attendance_records.student_id
      and e.status='active'
      and e.enrolled_on<=s.held_on
      and (e.ended_on is null or e.ended_on>=s.held_on)
  )
);
