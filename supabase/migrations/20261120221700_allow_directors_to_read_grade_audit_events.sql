drop policy if exists grade_record_events_scoped_read on public.grade_record_events;
create policy grade_record_events_scoped_read on public.grade_record_events
for select to authenticated
using (
  private.can_access_student(student_id,institution_id,'grades.read')
  and (
    private.has_institution_permission(institution_id,'grades.manage')
    or private.has_institution_permission(institution_id,'report_cards.approve')
  )
);
