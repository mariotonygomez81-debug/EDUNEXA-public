-- Attendance can only be recorded while the session is open.
drop policy if exists attendance_records_scoped_insert on public.attendance_records;
create policy attendance_records_scoped_insert on public.attendance_records
for insert to authenticated
with check (
  exists (
    select 1
    from public.attendance_sessions s
    join public.enrollments e
      on e.institution_id = s.institution_id
     and e.division_id = s.division_id
     and e.student_id = attendance_records.student_id
     and e.status = 'active'
    where s.id = attendance_records.session_id
      and s.institution_id = attendance_records.institution_id
      and s.status = 'open'
      and private.can_manage_division(s.division_id, s.institution_id, 'attendance.manage')
  )
);

drop policy if exists attendance_records_scoped_update on public.attendance_records;
create policy attendance_records_scoped_update on public.attendance_records
for update to authenticated
using (
  exists (
    select 1
    from public.attendance_sessions s
    join public.enrollments e
      on e.institution_id = s.institution_id
     and e.division_id = s.division_id
     and e.student_id = attendance_records.student_id
     and e.status = 'active'
    where s.id = attendance_records.session_id
      and s.institution_id = attendance_records.institution_id
      and private.can_access_student(e.student_id, e.institution_id, 'attendance.read')
  )
)
with check (
  exists (
    select 1
    from public.attendance_sessions s
    join public.enrollments e
      on e.institution_id = s.institution_id
     and e.division_id = s.division_id
     and e.student_id = attendance_records.student_id
     and e.status = 'active'
    where s.id = attendance_records.session_id
      and s.institution_id = attendance_records.institution_id
      and s.status = 'open'
      and private.can_manage_division(s.division_id, s.institution_id, 'attendance.manage')
  )
);
