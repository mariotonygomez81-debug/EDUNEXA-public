-- EDUNEXA: institutional read-only classroom access, teacher ownership and private profile data.
alter table public.profiles
  add column if not exists address text,
  add column if not exists professional_titles text;

alter table public.virtual_classrooms
  add column if not exists owner_membership_id uuid references public.memberships(id) on delete set null;

update public.virtual_classrooms vc
set owner_membership_id = m.id
from public.memberships m
where vc.owner_membership_id is null
  and vc.created_by = m.user_id
  and vc.institution_id = m.institution_id
  and m.status = 'active';

-- Preceptors may inspect every classroom, but no write capability is granted.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'classroom.read'
where r.key = 'prefect'
on conflict do nothing;

create or replace function private.can_access_classroom(
  p_classroom_id uuid,
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.virtual_classrooms vc
    join public.memberships m
      on m.institution_id = vc.institution_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    where vc.id = p_classroom_id
      and vc.institution_id = p_institution_id
      and private.has_institution_permission(p_institution_id, p_permission_key)
      and (
        (r.key = 'institution_admin'
          and p_permission_key in ('classroom.read','classroom.manage','classroom.grade'))
        or
        (r.key in ('director','prefect') and p_permission_key = 'classroom.read')
        or
        (r.key = 'teacher'
          and exists (
            select 1
            from public.staff_assignments sa
            where sa.membership_id = m.id
              and sa.institution_id = vc.institution_id
              and sa.assignment_type = 'teacher'
              and (sa.starts_on is null or sa.starts_on <= current_date)
              and (sa.ends_on is null or sa.ends_on >= current_date)
              and (
                (sa.course_subject_id is null and sa.division_id = vc.division_id)
                or (vc.course_subject_id is not null
                  and sa.division_id = vc.division_id
                  and sa.course_subject_id = vc.course_subject_id)
              )
          )
          and (
            p_permission_key = 'classroom.read'
            or (
              p_permission_key in ('classroom.manage','classroom.grade')
              and (vc.owner_membership_id = m.id or vc.created_by = m.user_id)
            )
          )
        )
        or
        (r.key = 'student'
          and p_permission_key in ('classroom.read','classroom.submit')
          and exists (
            select 1 from public.student_memberships sm
            join public.enrollments e
              on e.student_id = sm.student_id and e.institution_id = sm.institution_id
            where sm.membership_id = m.id
              and sm.institution_id = vc.institution_id
              and e.division_id = vc.division_id
              and e.status = 'active'
              and (e.enrolled_on is null or e.enrolled_on <= current_date)
              and (e.ended_on is null or e.ended_on >= current_date)
          )
        )
        or
        (r.key = 'guardian'
          and p_permission_key = 'classroom.read'
          and exists (
            select 1 from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id = g.id and sg.institution_id = g.institution_id
            join public.enrollments e
              on e.student_id = sg.student_id and e.institution_id = sg.institution_id
            where g.membership_id = m.id
              and g.institution_id = vc.institution_id
              and e.division_id = vc.division_id
              and e.status = 'active'
              and (e.enrolled_on is null or e.enrolled_on <= current_date)
              and (e.ended_on is null or e.ended_on >= current_date)
          )
        )
      )
  );
$function$;

-- Private profile photos: users can upload/read only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-profile-photos','teacher-profile-photos',false,5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists teacher_profile_photo_select_own on storage.objects;
create policy teacher_profile_photo_select_own
on storage.objects for select to authenticated
using (bucket_id = 'teacher-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists teacher_profile_photo_insert_own on storage.objects;
create policy teacher_profile_photo_insert_own
on storage.objects for insert to authenticated
with check (bucket_id = 'teacher-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists teacher_profile_photo_update_own on storage.objects;
create policy teacher_profile_photo_update_own
on storage.objects for update to authenticated
using (bucket_id = 'teacher-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'teacher-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists teacher_profile_photo_delete_own on storage.objects;
create policy teacher_profile_photo_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'teacher-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

revoke all on public.virtual_classrooms from anon, authenticated;
