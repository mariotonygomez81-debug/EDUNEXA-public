-- Scoped access for student records, attendance and grades.
-- All policies are institution-bound and rely on active memberships and role permissions.

create table if not exists public.student_memberships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  unique (institution_id, student_id),
  unique (institution_id, membership_id),
  foreign key (student_id, institution_id) references public.students(id, institution_id) on delete cascade,
  foreign key (membership_id, institution_id) references public.memberships(id, institution_id) on delete cascade
);
alter table public.student_memberships enable row level security;
revoke all on public.student_memberships from anon;
grant select, insert, update, delete on public.student_memberships to authenticated;

create or replace function private.can_access_student(
  p_student_id uuid,
  p_institution_id uuid,
  p_permission_key text
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and private.has_institution_permission(p_institution_id, p_permission_key)
      and (
        r.key in ('institution_admin', 'administrative', 'director')
        or (
          r.key in ('teacher', 'prefect')
          and exists (
            select 1
            from public.staff_assignments sa
            join public.enrollments e
              on e.institution_id = sa.institution_id
             and e.division_id = sa.division_id
            where sa.membership_id = m.id
              and sa.institution_id = p_institution_id
              and e.student_id = p_student_id
              and e.status = 'active'
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (sa.starts_on is null or sa.starts_on <= current_date)
          )
        )
        or (
          r.key = 'guardian'
          and exists (
            select 1
            from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id = g.id
             and sg.institution_id = g.institution_id
            where g.membership_id = m.id
              and g.institution_id = p_institution_id
              and sg.student_id = p_student_id
              and (
                p_permission_key not in ('grades.read', 'attendance.read')
                or (p_permission_key = 'grades.read' and sg.can_view_grades)
                or (p_permission_key = 'attendance.read' and sg.can_view_attendance)
              )
          )
        )
        or (
          r.key = 'student'
          and exists (
            select 1
            from public.student_memberships sm
            where sm.membership_id = m.id
              and sm.institution_id = p_institution_id
              and sm.student_id = p_student_id
          )
        )
      )
  );
$function$;

create or replace function private.can_manage_division(
  p_division_id uuid,
  p_institution_id uuid,
  p_permission_key text
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and private.has_institution_permission(p_institution_id, p_permission_key)
      and (
        r.key in ('institution_admin', 'administrative')
        or (
          r.key in ('teacher', 'prefect')
          and exists (
            select 1 from public.staff_assignments sa
            where sa.membership_id = m.id
              and sa.institution_id = p_institution_id
              and sa.division_id = p_division_id
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (sa.starts_on is null or sa.starts_on <= current_date)
          )
        )
      )
  );
$function$;

revoke all on function private.can_access_student(uuid, uuid, text) from public, anon;
revoke all on function private.can_manage_division(uuid, uuid, text) from public, anon;
grant execute on function private.can_access_student(uuid, uuid, text) to authenticated;
grant execute on function private.can_manage_division(uuid, uuid, text) to authenticated;

insert into public.permissions(key, description)
values ('students.link_membership', 'Vincular una cuenta escolar con su legajo de alumno')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'attendance.read'
where r.key = 'student'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'students.read'
where r.key = 'student'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'students.link_membership'
where r.key in ('institution_admin','administrative')
on conflict do nothing;

drop policy if exists student_memberships_admin_manage on public.student_memberships;
create policy student_memberships_admin_manage on public.student_memberships
for all to authenticated
using (private.has_institution_permission(institution_id, 'students.link_membership'))
with check (
  private.has_institution_permission(institution_id, 'students.link_membership')
  and exists (
    select 1 from public.memberships sm
    join public.membership_roles smr on smr.membership_id = sm.id and smr.institution_id = sm.institution_id
    join public.roles sr on sr.id = smr.role_id
    where sm.id = student_memberships.membership_id
      and sm.institution_id = student_memberships.institution_id
      and sm.status = 'active'
      and sr.key = 'student'
  )
);
drop policy if exists student_memberships_self_read on public.student_memberships;
create policy student_memberships_self_read on public.student_memberships
for select to authenticated
using (exists (
  select 1 from public.memberships m
  where m.id = student_memberships.membership_id
    and m.institution_id = student_memberships.institution_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
));

drop policy if exists students_scoped_read on public.students;
create policy students_scoped_read on public.students
for select to authenticated
using (private.can_access_student(id, institution_id, 'students.read'));
drop policy if exists students_scoped_insert on public.students;
create policy students_scoped_insert on public.students
for insert to authenticated
with check (private.has_institution_permission(institution_id, 'students.manage'));
drop policy if exists students_scoped_update on public.students;
create policy students_scoped_update on public.students
for update to authenticated
using (private.has_institution_permission(institution_id, 'students.manage'))
with check (private.has_institution_permission(institution_id, 'students.manage'));
revoke delete on public.students from authenticated;

drop policy if exists enrollments_scoped_read on public.enrollments;
create policy enrollments_scoped_read on public.enrollments
for select to authenticated
using (private.can_access_student(student_id, institution_id, 'students.read'));
drop policy if exists enrollments_scoped_insert on public.enrollments;
create policy enrollments_scoped_insert on public.enrollments
for insert to authenticated
with check (private.has_institution_permission(institution_id, 'students.manage'));
drop policy if exists enrollments_scoped_update on public.enrollments;
create policy enrollments_scoped_update on public.enrollments
for update to authenticated
using (private.has_institution_permission(institution_id, 'students.manage'))
with check (private.has_institution_permission(institution_id, 'students.manage'));
revoke delete on public.enrollments from authenticated;

drop policy if exists guardians_self_or_admin_read on public.guardians;
create policy guardians_self_or_admin_read on public.guardians
for select to authenticated
using (
  exists (select 1 from public.memberships m where m.id = guardians.membership_id and m.user_id = (select auth.uid()) and m.status = 'active')
  or private.has_institution_permission(institution_id, 'students.manage')
);
drop policy if exists student_guardians_scoped_read on public.student_guardians;
create policy student_guardians_scoped_read on public.student_guardians
for select to authenticated
using (private.can_access_student(student_id, institution_id, 'students.read'));
drop policy if exists student_guardians_admin_manage on public.student_guardians;
create policy student_guardians_admin_manage on public.student_guardians
for all to authenticated
using (private.has_institution_permission(institution_id, 'students.manage'))
with check (private.has_institution_permission(institution_id, 'students.manage'));

drop policy if exists attendance_sessions_scoped_read on public.attendance_sessions;
create policy attendance_sessions_scoped_read on public.attendance_sessions
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.division_id = attendance_sessions.division_id
      and e.institution_id = attendance_sessions.institution_id
      and e.status = 'active'
      and private.can_access_student(e.student_id, e.institution_id, 'attendance.read')
  )
);
drop policy if exists attendance_sessions_scoped_insert on public.attendance_sessions;
create policy attendance_sessions_scoped_insert on public.attendance_sessions
for insert to authenticated
with check (private.can_manage_division(division_id, institution_id, 'attendance.manage'));
drop policy if exists attendance_sessions_scoped_update on public.attendance_sessions;
create policy attendance_sessions_scoped_update on public.attendance_sessions
for update to authenticated
using (private.can_manage_division(division_id, institution_id, 'attendance.manage'))
with check (private.can_manage_division(division_id, institution_id, 'attendance.manage'));

drop policy if exists attendance_records_scoped_read on public.attendance_records;
create policy attendance_records_scoped_read on public.attendance_records
for select to authenticated
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
);
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
      and private.can_manage_division(s.division_id, s.institution_id, 'attendance.manage')
  )
);

drop policy if exists assessments_scoped_read on public.assessments;
create policy assessments_scoped_read on public.assessments
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.division_id = assessments.division_id
      and e.institution_id = assessments.institution_id
      and e.status = 'active'
      and private.can_access_student(e.student_id, e.institution_id, 'grades.read')
  )
);
drop policy if exists assessments_scoped_insert on public.assessments;
create policy assessments_scoped_insert on public.assessments
for insert to authenticated
with check (private.can_manage_division(division_id, institution_id, 'grades.manage'));
drop policy if exists assessments_scoped_update on public.assessments;
create policy assessments_scoped_update on public.assessments
for update to authenticated
using (private.can_manage_division(division_id, institution_id, 'grades.manage'))
with check (private.can_manage_division(division_id, institution_id, 'grades.manage'));

drop policy if exists grade_records_scoped_read on public.grade_records;
create policy grade_records_scoped_read on public.grade_records
for select to authenticated
using (
  exists (
    select 1
    from public.assessments a
    join public.enrollments e
      on e.institution_id = a.institution_id
     and e.division_id = a.division_id
     and e.student_id = grade_records.student_id
     and e.status = 'active'
    where a.id = grade_records.assessment_id
      and a.institution_id = grade_records.institution_id
      and private.can_access_student(e.student_id, e.institution_id, 'grades.read')
  )
);
drop policy if exists grade_records_scoped_insert on public.grade_records;
create policy grade_records_scoped_insert on public.grade_records
for insert to authenticated
with check (
  exists (
    select 1
    from public.assessments a
    join public.enrollments e
      on e.institution_id = a.institution_id
     and e.division_id = a.division_id
     and e.student_id = grade_records.student_id
     and e.status = 'active'
    where a.id = grade_records.assessment_id
      and a.institution_id = grade_records.institution_id
      and private.can_manage_division(a.division_id, a.institution_id, 'grades.manage')
  )
);
drop policy if exists grade_records_scoped_update on public.grade_records;
create policy grade_records_scoped_update on public.grade_records
for update to authenticated
using (
  exists (
    select 1
    from public.assessments a
    join public.enrollments e
      on e.institution_id = a.institution_id
     and e.division_id = a.division_id
     and e.student_id = grade_records.student_id
     and e.status = 'active'
    where a.id = grade_records.assessment_id
      and a.institution_id = grade_records.institution_id
      and private.can_access_student(e.student_id, e.institution_id, 'grades.read')
  )
)
with check (
  exists (
    select 1
    from public.assessments a
    join public.enrollments e
      on e.institution_id = a.institution_id
     and e.division_id = a.division_id
     and e.student_id = grade_records.student_id
     and e.status = 'active'
    where a.id = grade_records.assessment_id
      and a.institution_id = grade_records.institution_id
      and private.can_manage_division(a.division_id, a.institution_id, 'grades.manage')
  )
);
