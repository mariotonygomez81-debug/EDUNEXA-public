drop policy if exists student_guardians_admin_manage on public.student_guardians;
drop policy if exists student_memberships_admin_manage on public.student_memberships;

drop policy if exists student_guardians_scoped_read on public.student_guardians;
create policy student_guardians_scoped_read on public.student_guardians
for select to authenticated
using (
  private.can_access_student(student_id,institution_id,'students.read')
  or private.has_institution_permission(institution_id,'students.manage')
);

create policy student_guardians_admin_insert on public.student_guardians
for insert to authenticated
with check (private.has_institution_permission(institution_id,'students.manage'));

create policy student_guardians_admin_update on public.student_guardians
for update to authenticated
using (private.has_institution_permission(institution_id,'students.manage'))
with check (private.has_institution_permission(institution_id,'students.manage'));

create policy student_guardians_admin_delete on public.student_guardians
for delete to authenticated
using (private.has_institution_permission(institution_id,'students.manage'));

drop policy if exists student_memberships_self_read on public.student_memberships;
create policy student_memberships_self_read on public.student_memberships
for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.id=student_memberships.membership_id
      and m.institution_id=student_memberships.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
  or private.has_institution_permission(institution_id,'students.link_membership')
);

create policy student_memberships_admin_insert on public.student_memberships
for insert to authenticated
with check (
  private.has_institution_permission(institution_id,'students.link_membership')
  and exists (
    select 1
    from public.memberships sm
    join public.membership_roles smr
      on smr.membership_id=sm.id and smr.institution_id=sm.institution_id
    join public.roles sr on sr.id=smr.role_id
    where sm.id=student_memberships.membership_id
      and sm.institution_id=student_memberships.institution_id
      and sm.status='active'
      and sr.key='student'
  )
);

create policy student_memberships_admin_update on public.student_memberships
for update to authenticated
using (private.has_institution_permission(institution_id,'students.link_membership'))
with check (
  private.has_institution_permission(institution_id,'students.link_membership')
  and exists (
    select 1
    from public.memberships sm
    join public.membership_roles smr
      on smr.membership_id=sm.id and smr.institution_id=sm.institution_id
    join public.roles sr on sr.id=smr.role_id
    where sm.id=student_memberships.membership_id
      and sm.institution_id=student_memberships.institution_id
      and sm.status='active'
      and sr.key='student'
  )
);

create policy student_memberships_admin_delete on public.student_memberships
for delete to authenticated
using (private.has_institution_permission(institution_id,'students.link_membership'));

revoke truncate,references,trigger on table public.student_guardians from public,anon,authenticated;
revoke truncate,references,trigger on table public.student_memberships from public,anon,authenticated;
