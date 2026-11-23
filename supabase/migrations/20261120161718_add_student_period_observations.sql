create table if not exists public.student_period_observations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null,
  grading_period_id uuid not null,
  author_membership_id uuid not null references public.memberships(id) on delete restrict,
  observation text not null check (char_length(btrim(observation)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_period_observations_student_fk
    foreign key (student_id, institution_id)
    references public.students(id, institution_id) on delete cascade,
  constraint student_period_observations_period_fk
    foreign key (grading_period_id, institution_id)
    references public.grading_periods(id, institution_id) on delete cascade,
  constraint student_period_observations_author_fk
    foreign key (author_membership_id, institution_id)
    references public.memberships(id, institution_id) on delete restrict,
  constraint student_period_observations_one_per_period
    unique (institution_id, student_id, grading_period_id)
);

create index if not exists student_period_observations_student_period_idx
  on public.student_period_observations (institution_id, student_id, grading_period_id);

alter table public.student_period_observations enable row level security;
revoke all on public.student_period_observations from anon, authenticated;
grant select, insert, update on public.student_period_observations to authenticated;

drop policy if exists student_period_observations_deny_client_access on public.student_period_observations;
create policy student_period_observations_deny_client_access
  on public.student_period_observations for all to authenticated
  using (false) with check (false);

drop policy if exists student_period_observations_scoped_read on public.student_period_observations;
create policy student_period_observations_scoped_read
  on public.student_period_observations for select to authenticated
  using (private.can_access_student(student_id, institution_id, 'grades.read'));

drop policy if exists student_period_observations_scoped_insert on public.student_period_observations;
create policy student_period_observations_scoped_insert
  on public.student_period_observations for insert to authenticated
  with check (
    exists (
      select 1
      from public.enrollments e
      where e.institution_id = student_period_observations.institution_id
        and e.student_id = student_period_observations.student_id
        and e.status = 'active'
        and private.can_manage_division(e.division_id, e.institution_id, 'grades.manage')
    )
    and exists (
      select 1 from public.memberships m
      where m.id = student_period_observations.author_membership_id
        and m.institution_id = student_period_observations.institution_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

drop policy if exists student_period_observations_scoped_update on public.student_period_observations;
create policy student_period_observations_scoped_update
  on public.student_period_observations for update to authenticated
  using (
    author_membership_id in (
      select m.id from public.memberships m
      where m.user_id = (select auth.uid())
        and m.institution_id = student_period_observations.institution_id
        and m.status = 'active'
    )
    and exists (
      select 1 from public.enrollments e
      where e.institution_id = student_period_observations.institution_id
        and e.student_id = student_period_observations.student_id
        and e.status = 'active'
        and private.can_manage_division(e.division_id, e.institution_id, 'grades.manage')
    )
  )
  with check (
    author_membership_id in (
      select m.id from public.memberships m
      where m.user_id = (select auth.uid())
        and m.institution_id = student_period_observations.institution_id
        and m.status = 'active'
    )
    and exists (
      select 1 from public.enrollments e
      where e.institution_id = student_period_observations.institution_id
        and e.student_id = student_period_observations.student_id
        and e.status = 'active'
        and private.can_manage_division(e.division_id, e.institution_id, 'grades.manage')
    )
  );
