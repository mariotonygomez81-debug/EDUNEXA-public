alter table public.prefect_attendance_records
  drop constraint if exists prefect_attendance_records_status_check;
alter table public.prefect_attendance_records
  add constraint prefect_attendance_records_status_check
  check (status in ('present','absent','half_absence','late','justified','early_departure'));
