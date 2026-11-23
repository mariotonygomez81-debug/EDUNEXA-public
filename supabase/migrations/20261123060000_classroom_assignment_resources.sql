-- Assignment resources: private files and validated external links.
create table public.classroom_assignment_resources (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  classroom_id uuid not null,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  created_by_membership_id uuid not null,
  kind text not null check (kind in ('file','link')),
  title text not null check (length(title) between 1 and 180),
  url text,
  bucket_id text not null default 'classroom-files' check (bucket_id='classroom-files'),
  object_path text unique,
  original_filename text,
  mime_type text,
  byte_size bigint,
  status text not null default 'ready' check (status in ('pending','ready','rejected')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint classroom_assignment_resource_scope_fkey foreign key (classroom_id,institution_id)
    references public.virtual_classrooms(id,institution_id) on delete cascade,
  constraint classroom_assignment_resource_creator_fkey foreign key (created_by_membership_id,institution_id)
    references public.memberships(id,institution_id) on delete cascade,
  constraint classroom_assignment_resource_shape check (
    (kind='link' and url is not null and object_path is null and original_filename is null and mime_type is null and byte_size is null)
    or
    (kind='file' and url is null and object_path is not null and original_filename is not null and mime_type is not null and byte_size between 1 and 10485760)
  )
);
create index classroom_assignment_resources_assignment_idx
  on public.classroom_assignment_resources(assignment_id,status,created_at);
alter table public.classroom_assignment_resources enable row level security;
revoke all on table public.classroom_assignment_resources from public,anon,authenticated;

create or replace function private.can_upload_classroom_assignment_resource(p_bucket_id text,p_object_path text)
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists(
  select 1 from public.classroom_assignment_resources r
  join public.memberships m on m.id=r.created_by_membership_id and m.institution_id=r.institution_id
    and m.user_id=(select auth.uid()) and m.status='active'
  where r.bucket_id=p_bucket_id and r.object_path=p_object_path and r.kind='file'
    and r.status='pending' and r.expires_at>now()
    and private.can_access_classroom(r.classroom_id,r.institution_id,'classroom.manage')
 );
$function$;

create or replace function private.can_read_classroom_assignment_resource(p_bucket_id text,p_object_path text)
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists(
  select 1 from public.classroom_assignment_resources r
  join public.assignments a on a.id=r.assignment_id
  where r.bucket_id=p_bucket_id and r.object_path=p_object_path and r.kind='file' and r.status='ready'
    and private.can_access_classroom(r.classroom_id,r.institution_id,'classroom.read')
    and (a.published_at is not null or private.can_access_classroom(r.classroom_id,r.institution_id,'classroom.manage'))
 );
$function$;
revoke all on function private.can_upload_classroom_assignment_resource(text,text) from public,anon;
revoke all on function private.can_read_classroom_assignment_resource(text,text) from public,anon;
grant execute on function private.can_upload_classroom_assignment_resource(text,text) to authenticated;
grant execute on function private.can_read_classroom_assignment_resource(text,text) to authenticated;

create policy classroom_assignment_resources_upload on storage.objects
for insert to authenticated with check (
 bucket_id='classroom-files' and (select private.can_upload_classroom_assignment_resource(bucket_id,name))
);
create policy classroom_assignment_resources_read on storage.objects
for select to authenticated using (
 bucket_id='classroom-files' and (select private.can_read_classroom_assignment_resource(bucket_id,name))
);

create or replace function private.add_classroom_assignment_link_impl(
 p_assignment_id uuid,p_title text,p_url text
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_classroom_id uuid; v_membership_id uuid; v_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 180
   or p_url is null or length(p_url)>2048 or p_url !~ '^https://[^[:space:]]+$' then
  raise exception 'Invalid resource title or URL' using errcode='22023';
 end if;
 select a.institution_id,a.classroom_id into v_institution_id,v_classroom_id
 from public.assignments a where a.id=p_assignment_id;
 if v_institution_id is null or not private.can_access_classroom(v_classroom_id,v_institution_id,'classroom.manage') then
  raise exception 'Assignment management not permitted' using errcode='42501';
 end if;
 select m.id into v_membership_id from public.memberships m
 where m.user_id=(select auth.uid()) and m.institution_id=v_institution_id and m.status='active' limit 1;
 if v_membership_id is null then raise exception 'Active membership required' using errcode='42501'; end if;
 insert into public.classroom_assignment_resources(institution_id,classroom_id,assignment_id,created_by_membership_id,kind,title,url)
 values(v_institution_id,v_classroom_id,p_assignment_id,v_membership_id,'link',btrim(p_title),btrim(p_url))
 returning id into v_id;
 return v_id;
end;
$function$;

create or replace function private.create_classroom_assignment_resource_upload_impl(
 p_assignment_id uuid,p_original_filename text,p_mime_type text,p_byte_size bigint
) returns table(resource_id uuid,object_path text)
language plpgsql security definer set search_path=''
as $function$
declare
 v_institution_id uuid; v_classroom_id uuid; v_membership_id uuid; v_extension text;
 v_id uuid:=gen_random_uuid(); v_path text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_original_filename is null or length(btrim(p_original_filename)) not between 1 and 180
  or position('/' in p_original_filename)>0 or position(chr(92) in p_original_filename)>0
  or p_original_filename ~ '[[:cntrl:]]' then raise exception 'Invalid file name' using errcode='22023'; end if;
 if p_byte_size is null or p_byte_size<1 or p_byte_size>10485760 then raise exception 'File must be at most 10 MB' using errcode='22023'; end if;
 v_extension:=case p_mime_type
  when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
  when 'text/plain' then 'txt'
  when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
  when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
  when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
  else null end;
 if v_extension is null then raise exception 'File type not allowed' using errcode='22023'; end if;
 select a.institution_id,a.classroom_id into v_institution_id,v_classroom_id
 from public.assignments a where a.id=p_assignment_id;
 if v_institution_id is null or not private.can_access_classroom(v_classroom_id,v_institution_id,'classroom.manage') then
  raise exception 'Assignment management not permitted' using errcode='42501'; end if;
 select m.id into v_membership_id from public.memberships m
 where m.user_id=(select auth.uid()) and m.institution_id=v_institution_id and m.status='active' limit 1;
 if v_membership_id is null then raise exception 'Active membership required' using errcode='42501'; end if;
 v_path:=format('institutions/%s/classrooms/%s/assignments/%s/resources/%s.%s',v_institution_id,v_classroom_id,p_assignment_id,v_id,v_extension);
 insert into public.classroom_assignment_resources(
  id,institution_id,classroom_id,assignment_id,created_by_membership_id,kind,title,bucket_id,object_path,original_filename,mime_type,byte_size,status,expires_at
 ) values (
  v_id,v_institution_id,v_classroom_id,p_assignment_id,v_membership_id,'file',btrim(p_original_filename),
  'classroom-files',v_path,btrim(p_original_filename),p_mime_type,p_byte_size,'pending',now()+interval '1 hour'
 );
 return query select v_id,v_path;
end;
$function$;

create or replace function private.finalize_classroom_assignment_resource_upload_impl(p_resource_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
 v_resource public.classroom_assignment_resources%rowtype;
 v_size bigint; v_mime text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select r.* into v_resource from public.classroom_assignment_resources r
 join public.memberships m on m.id=r.created_by_membership_id and m.institution_id=r.institution_id
  and m.user_id=(select auth.uid()) and m.status='active'
 where r.id=p_resource_id and r.kind='file' and r.status='pending' and r.expires_at>now()
 for update of r;
 if not found then raise exception 'Upload intent not found or expired' using errcode='42501'; end if;
 if not private.can_access_classroom(v_resource.classroom_id,v_resource.institution_id,'classroom.manage') then
  raise exception 'Assignment management permission is no longer active' using errcode='42501'; end if;
 select nullif(o.metadata->>'size','')::bigint,lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'))
 into v_size,v_mime from storage.objects o where o.bucket_id=v_resource.bucket_id and o.name=v_resource.object_path;
 if not found or v_size is null or v_mime is null or v_size<>v_resource.byte_size or v_mime<>v_resource.mime_type then
  raise exception 'Uploaded object metadata mismatch' using errcode='23514'; end if;
 update public.classroom_assignment_resources set status='ready',expires_at=null where id=p_resource_id;
 return p_resource_id;
end;
$function$;

create or replace function private.list_classroom_assignment_resources_impl(p_classroom_id uuid)
returns table(resource_id uuid,assignment_id uuid,kind text,title text,url text,object_path text,original_filename text,mime_type text,byte_size bigint,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_institution_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select vc.institution_id into v_institution_id from public.virtual_classrooms vc where vc.id=p_classroom_id;
 if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.read') then
  raise exception 'Classroom access denied' using errcode='42501'; end if;
 return query select r.id,r.assignment_id,r.kind,r.title,r.url,r.object_path,r.original_filename,r.mime_type,r.byte_size,r.created_at
 from public.classroom_assignment_resources r join public.assignments a on a.id=r.assignment_id
 where r.classroom_id=p_classroom_id and r.institution_id=v_institution_id and r.status='ready'
  and (a.published_at is not null or private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage'))
 order by r.created_at;
end;
$function$;

create or replace function public.add_classroom_assignment_link(p_assignment_id uuid,p_title text,p_url text)
returns uuid language sql security invoker set search_path=''
as $function$ select private.add_classroom_assignment_link_impl(p_assignment_id,p_title,p_url); $function$;
create or replace function public.create_classroom_assignment_resource_upload(p_assignment_id uuid,p_original_filename text,p_mime_type text,p_byte_size bigint)
returns table(resource_id uuid,object_path text) language sql security invoker set search_path=''
as $function$ select * from private.create_classroom_assignment_resource_upload_impl(p_assignment_id,p_original_filename,p_mime_type,p_byte_size); $function$;
create or replace function public.finalize_classroom_assignment_resource_upload(p_resource_id uuid)
returns uuid language sql security invoker set search_path=''
as $function$ select private.finalize_classroom_assignment_resource_upload_impl(p_resource_id); $function$;
create or replace function public.list_classroom_assignment_resources(p_classroom_id uuid)
returns table(resource_id uuid,assignment_id uuid,kind text,title text,url text,object_path text,original_filename text,mime_type text,byte_size bigint,created_at timestamptz)
language sql stable security invoker set search_path=''
as $function$ select * from private.list_classroom_assignment_resources_impl(p_classroom_id); $function$;

revoke all on function private.add_classroom_assignment_link_impl(uuid,text,text) from public,anon;
revoke all on function private.create_classroom_assignment_resource_upload_impl(uuid,text,text,bigint) from public,anon;
revoke all on function private.finalize_classroom_assignment_resource_upload_impl(uuid) from public,anon;
revoke all on function private.list_classroom_assignment_resources_impl(uuid) from public,anon;
grant execute on function private.add_classroom_assignment_link_impl(uuid,text,text) to authenticated;
grant execute on function private.create_classroom_assignment_resource_upload_impl(uuid,text,text,bigint) to authenticated;
grant execute on function private.finalize_classroom_assignment_resource_upload_impl(uuid) to authenticated;
grant execute on function private.list_classroom_assignment_resources_impl(uuid) to authenticated;
revoke all on function public.add_classroom_assignment_link(uuid,text,text) from public,anon;
revoke all on function public.create_classroom_assignment_resource_upload(uuid,text,text,bigint) from public,anon;
revoke all on function public.finalize_classroom_assignment_resource_upload(uuid) from public,anon;
revoke all on function public.list_classroom_assignment_resources(uuid) from public,anon;
grant execute on function public.add_classroom_assignment_link(uuid,text,text) to authenticated;
grant execute on function public.create_classroom_assignment_resource_upload(uuid,text,text,bigint) to authenticated;
grant execute on function public.finalize_classroom_assignment_resource_upload(uuid) to authenticated;
grant execute on function public.list_classroom_assignment_resources(uuid) to authenticated;
