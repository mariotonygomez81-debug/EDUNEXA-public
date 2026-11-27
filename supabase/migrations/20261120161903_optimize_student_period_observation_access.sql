-- Keep row-level security policies focused on the actual allowed operations.
-- PostgreSQL denies operations for which no applicable policy exists.
drop policy if exists student_period_observations_deny_client_access on public.student_period_observations;

-- Remove the redundant single-column FK; the composite FK also guarantees
-- that the author membership belongs to the same institution.
alter table public.student_period_observations
  drop constraint if exists student_period_observations_author_membership_id_fkey;

-- Index the composite foreign keys so deletes/updates on referenced rows
-- do not require full scans of the observations table.
create index if not exists student_period_observations_student_fk_idx
  on public.student_period_observations (student_id, institution_id);
create index if not exists student_period_observations_period_fk_idx
  on public.student_period_observations (grading_period_id, institution_id);
create index if not exists student_period_observations_author_fk_idx
  on public.student_period_observations (author_membership_id, institution_id);
