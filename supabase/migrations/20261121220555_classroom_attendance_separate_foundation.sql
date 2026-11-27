-- Separate teacher-led classroom attendance from institutional/preceptor attendance.
create table if not exists public.classroom_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  classroom_id uuid not null references public.virtual_classrooms(id) on delete restrict,
  division_id uuid not null references public.divisions(id) on delete restrict,
  held_on date not null,
  period_label text,
  status text not null default 'draft' check (status in ('draft','submitted','closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, institution_id),
  constraint classroom_attendance_session_classroom_scope
    foreign key (classroom_id, institution_id)
    references public.virtual_classrooms(id, institution_id) on delete restrict
);

create table if not exists public.classroom_attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  institution_id uuid not null references public.institutions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null check (status in ('present','absent','late','justified')),
  note text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id),
  foreign key (session_id, institution_id)
    references public.classroom_attendance_sessions(id, institution_id) on delete cascade
);

create index if not exists classroom_attendance_sessions_classroom_date_idx
  on public.classroom_attendance_sessions(classroom_id, held_on desc);
create index if not exists classroom_attendance_records_student_idx
  on public.classroom_attendance_records(institution_id, student_id);

alter table public.classroom_attendance_sessions enable row level security;
alter table public.classroom_attendance_records enable row level security;
revoke all on public.classroom_attendance_sessions from anon, authenticated;
revoke all on public.classroom_attendance_records from anon, authenticated;

comment on table public.classroom_attendance_sessions is
  'Independent attendance sessions recorded by classroom teachers; never merged with institutional/preceptor attendance_sessions.';
comment on table public.classroom_attendance_records is
  'Per-student attendance for a classroom lesson; independent from institutional attendance_records.';
