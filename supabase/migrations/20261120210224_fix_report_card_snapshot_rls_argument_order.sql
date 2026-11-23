drop policy if exists "Students and authorized staff can read published report snapshots"
  on public.report_card_snapshots;

create policy "Students and authorized staff can read published report snapshots"
on public.report_card_snapshots
for select
to authenticated
using (
  private.can_access_student(student_id, institution_id, 'grades.read')
  and exists (
    select 1
    from public.report_card_workflows w
    where w.id = workflow_id
      and w.institution_id = report_card_snapshots.institution_id
      and w.status = 'published'
  )
);