-- Read-only academic history for students; institutional staff maintain these records.
create table if not exists public.student_previous_subjects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null,
  subject_name text not null check (length(btrim(subject_name)) between 1 and 160),
  school_year text,
  final_grade numeric(5,2) check (final_grade is null or (final_grade >= 0 and final_grade <= 100)),
  status text not null default 'pending'
    check (status in ('pending','in_progress','approved','equivalency','not_approved')),
  observations text check (observations is null or length(observations) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_previous_subjects_student_institution_fk
    foreign key (student_id, institution_id)
    references public.students(id, institution_id) on delete cascade
);

create index if not exists student_previous_subjects_student_idx
  on public.student_previous_subjects (institution_id, student_id, school_year);

alter table public.student_previous_subjects enable row level security;

revoke all on public.student_previous_subjects from anon;
grant select, insert, update, delete on public.student_previous_subjects to authenticated;

drop policy if exists student_previous_subjects_scoped_read on public.student_previous_subjects;
create policy student_previous_subjects_scoped_read
  on public.student_previous_subjects for select to authenticated
  using (private.can_access_student(student_id, institution_id, 'students.read'));

drop policy if exists student_previous_subjects_scoped_insert on public.student_previous_subjects;
create policy student_previous_subjects_scoped_insert
  on public.student_previous_subjects for insert to authenticated
  with check (private.has_institution_permission(institution_id, 'students.manage'));

drop policy if exists student_previous_subjects_scoped_update on public.student_previous_subjects;
create policy student_previous_subjects_scoped_update
  on public.student_previous_subjects for update to authenticated
  using (private.has_institution_permission(institution_id, 'students.manage'))
  with check (private.has_institution_permission(institution_id, 'students.manage'));

drop policy if exists student_previous_subjects_scoped_delete on public.student_previous_subjects;
create policy student_previous_subjects_scoped_delete
  on public.student_previous_subjects for delete to authenticated
  using (private.has_institution_permission(institution_id, 'students.manage'));
