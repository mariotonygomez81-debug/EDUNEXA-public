-- Treat a missing period label as one daily session, not as an unlimited NULL.
create unique index if not exists attendance_sessions_unique_period_idx
on public.attendance_sessions (
  institution_id,
  division_id,
  held_on,
  coalesce(period_label, '')
);
