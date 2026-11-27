-- Prevent duplicate active enrollment rows for the same student and division.
create unique index if not exists enrollments_one_active_per_division_idx
on public.enrollments (institution_id, student_id, division_id)
where status = 'active';
