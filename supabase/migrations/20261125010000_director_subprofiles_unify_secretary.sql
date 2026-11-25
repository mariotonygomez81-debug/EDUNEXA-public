-- Unify Secretary as a Director subprofile while preserving existing access.
alter table public.memberships
  add column if not exists director_subprofile text;

alter table public.memberships
  drop constraint if exists memberships_director_subprofile_check;

alter table public.memberships
  add constraint memberships_director_subprofile_check
  check (
    director_subprofile is null
    or director_subprofile in (
      'rector',
      'vicerrector',
      'secretaria',
      'director_proyectos',
      'director_deportes',
      'representante_legal',
      'pedagoga'
    )
  );

-- The Director profile inherits the permissions previously granted to Secretary.
insert into public.role_permissions (role_id, permission_id)
select director_role.id, rp.permission_id
from public.roles director_role
join public.roles secretary_role on secretary_role.key = 'secretary'
join public.role_permissions rp on rp.role_id = secretary_role.id
where director_role.key = 'director'
  and not exists (
    select 1
    from public.role_permissions existing
    where existing.role_id = director_role.id
      and existing.permission_id = rp.permission_id
  );

-- Existing Secretary memberships become Director memberships with the
-- Secretary subprofile. Keep all other roles assigned to those memberships.
update public.memberships m
set director_subprofile = coalesce(m.director_subprofile, 'secretaria')
where exists (
  select 1
  from public.membership_roles mr
  join public.roles r on r.id = mr.role_id
  where mr.membership_id = m.id
    and r.key = 'secretary'
);

insert into public.membership_roles (membership_id, institution_id, role_id)
select mr.membership_id, mr.institution_id, director_role.id
from public.membership_roles mr
join public.roles secretary_role on secretary_role.id = mr.role_id
join public.roles director_role on director_role.key = 'director'
where secretary_role.key = 'secretary'
  and not exists (
    select 1 from public.membership_roles existing
    where existing.membership_id = mr.membership_id
      and existing.institution_id = mr.institution_id
      and existing.role_id = director_role.id
  );

delete from public.membership_roles mr
using public.roles r
where mr.role_id = r.id
  and r.key = 'secretary';

update public.roles
set name = 'Directivos',
    description = 'Perfil principal de dirección institucional. Los cargos se asignan como subperfiles y heredan sus permisos.'
where key = 'director';

-- Secretary is no longer a separate audience/role; its memberships now use director.
create or replace function private.can_read_academic_calendar_audience(
  p_institution_id uuid,
  p_audience text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    where m.institution_id = p_institution_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        p_audience = 'all'
        or exists (
          select 1
          from public.membership_roles mr
          join public.roles r on r.id = mr.role_id
          where mr.membership_id = m.id
            and mr.institution_id = m.institution_id
            and (
              (p_audience = 'staff' and r.key = any (array[
                'institution_admin','director','administrative','teacher','prefect'
              ]::text[]))
              or (p_audience = 'teachers' and r.key = 'teacher')
              or (p_audience = 'students' and r.key = 'student')
              or (p_audience = 'families' and r.key = 'guardian')
              or (p_audience = 'prefects' and r.key = 'prefect')
            )
        )
      )
  );
$function$;

revoke all on function private.can_read_academic_calendar_audience(uuid, text) from public;
grant execute on function private.can_read_academic_calendar_audience(uuid, text) to authenticated;
