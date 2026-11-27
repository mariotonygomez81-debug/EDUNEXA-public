-- Students may consult their own published report cards.
-- private.can_access_student still requires the student's own student_memberships link,
-- so this does not grant access to other students or permit grade management.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'grades.read'
where r.key = 'student'
on conflict do nothing;
