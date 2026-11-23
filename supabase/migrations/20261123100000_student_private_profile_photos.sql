-- Private student profile photos. Each student can access only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-profile-photos','student-profile-photos',false,5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_profile_photo_select_own on storage.objects;
create policy student_profile_photo_select_own
on storage.objects for select to authenticated
using (bucket_id = 'student-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists student_profile_photo_insert_own on storage.objects;
create policy student_profile_photo_insert_own
on storage.objects for insert to authenticated
with check (bucket_id = 'student-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists student_profile_photo_update_own on storage.objects;
create policy student_profile_photo_update_own
on storage.objects for update to authenticated
using (bucket_id = 'student-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'student-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists student_profile_photo_delete_own on storage.objects;
create policy student_profile_photo_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'student-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text);
