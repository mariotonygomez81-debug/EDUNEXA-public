-- Backfill the titular teacher only when the classroom has exactly one active matching teacher assignment.
with eligible_owner as (
  select vc.id as classroom_id, min(sa.membership_id::text)::uuid as membership_id
  from public.virtual_classrooms vc
  join public.staff_assignments sa
    on sa.institution_id=vc.institution_id
   and sa.division_id=vc.division_id
   and (sa.course_subject_id is null or sa.course_subject_id=vc.course_subject_id)
   and sa.assignment_type='teacher'
   and (sa.starts_on is null or sa.starts_on<=current_date)
   and (sa.ends_on is null or sa.ends_on>=current_date)
  where vc.owner_membership_id is null
    and vc.created_by is null
  group by vc.id
  having count(distinct sa.membership_id)=1
)
update public.virtual_classrooms vc
set owner_membership_id=e.membership_id
from eligible_owner e
where vc.id=e.classroom_id;
