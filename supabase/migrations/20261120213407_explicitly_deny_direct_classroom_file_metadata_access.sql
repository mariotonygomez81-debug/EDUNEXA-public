create policy classroom_file_objects_no_direct_client_access
on public.classroom_file_objects
for all
to authenticated
using (false)
with check (false);
