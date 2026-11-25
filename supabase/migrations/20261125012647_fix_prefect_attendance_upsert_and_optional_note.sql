-- PostgREST upsert checks UPDATE privileges for every supplied column,
-- including the conflict key columns. Keep row access constrained by RLS.
grant update (institution_id, session_id, student_id, status, note, recorded_by, recorded_at)
on public.prefect_attendance_records to authenticated;

-- Observation is deliberately optional.
alter table public.prefect_attendance_records
  alter column note drop not null;