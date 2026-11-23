-- Add a dedicated Secretaría profile for institutional academic administration.
insert into public.roles (key, name, description, is_system)
values (
  'secretary',
  'Secretaría',
  'Gestiona inscripciones, matrículas, pases, legajos y documentación escolar autorizada.',
  true
)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    is_system = true;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'secretary'
  and p.key in (
    'institution.read',
    'students.read',
    'students.manage',
    'reports.read',
    'support.create'
  )
on conflict do nothing;

-- Keep the general administrative profile read-only for student records;
-- admissions and enrollment changes belong to Secretaría.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key = 'administrative'
  and p.key = 'students.manage';
