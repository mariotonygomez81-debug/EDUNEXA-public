-- A member can inspect only their own active staff assignments.
-- Institutional membership managers may inspect assignments for administration.
drop policy if exists staff_assignments_self_or_admin_read on public.staff_assignments;
create policy staff_assignments_self_or_admin_read on public.staff_assignments
for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.id = staff_assignments.membership_id
      and m.institution_id = staff_assignments.institution_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
  or private.has_institution_permission(institution_id, 'memberships.manage')
);
