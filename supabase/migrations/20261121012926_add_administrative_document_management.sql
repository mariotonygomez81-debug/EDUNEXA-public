-- Private institutional document management for the administrative profile.
insert into public.permissions(key, description)
values
  ('admin_documents.read', 'Consultar registros documentales administrativos autorizados.'),
  ('admin_documents.manage', 'Crear registros y adjuntar documentación administrativa.')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('admin_documents.read','admin_documents.manage')
where r.key in ('institution_admin','administrative')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key='admin_documents.read'
where r.key='director'
on conflict do nothing;

create table public.admin_documents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  title text not null check (length(btrim(title)) between 3 and 180),
  category text not null check (category in ('institutional','personnel','finance','maintenance','purchases','other')),
  description text not null default '' check (length(description) <= 5000),
  reference_code text check (reference_code is null or length(reference_code) <= 80),
  document_date date not null default current_date,
  status text not null default 'active' check (status in ('active','archived')),
  created_by_membership_id uuid not null,
  updated_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,institution_id),
  constraint admin_documents_creator_fk foreign key (created_by_membership_id,institution_id)
    references public.memberships(id,institution_id),
  constraint admin_documents_updater_fk foreign key (updated_by_membership_id,institution_id)
    references public.memberships(id,institution_id)
);

create index admin_documents_institution_date_idx
  on public.admin_documents(institution_id,document_date desc,created_at desc);
create index admin_documents_category_status_idx
  on public.admin_documents(institution_id,category,status);

create table public.admin_document_files (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  document_id uuid not null,
  uploaded_by_membership_id uuid not null,
  bucket_id text not null default 'admin-documents-private'
    check (bucket_id='admin-documents-private'),
  object_path text not null unique,
  original_filename text not null check (length(original_filename) between 1 and 180),
  mime_type text not null check (mime_type in (
    'application/pdf','image/jpeg','image/png','text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  upload_status text not null default 'pending' check (upload_status in ('pending','ready','rejected')),
  expires_at timestamptz not null default (now()+interval '1 hour'),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_document_files_document_fk foreign key (document_id,institution_id)
    references public.admin_documents(id,institution_id) on delete cascade,
  constraint admin_document_files_uploader_fk foreign key (uploaded_by_membership_id,institution_id)
    references public.memberships(id,institution_id) on delete cascade
);

create index admin_document_files_document_idx
  on public.admin_document_files(document_id,created_at desc) where upload_status='ready';
create index admin_document_files_expiry_idx
  on public.admin_document_files(expires_at) where upload_status='pending';

alter table public.admin_documents enable row level security;
alter table public.admin_document_files enable row level security;
revoke all on table public.admin_documents, public.admin_document_files from public, anon, authenticated;
grant select on table public.admin_documents to authenticated;
grant select on table public.admin_document_files to authenticated;

create policy admin_documents_read on public.admin_documents
for select to authenticated
using (
  private.has_institution_permission(institution_id,'admin_documents.read')
  and (
    private.has_institution_permission(institution_id,'admin_documents.manage')
    or category in ('institutional','maintenance','purchases','other')
  )
);


create policy admin_document_files_read on public.admin_document_files
for select to authenticated
using (
  private.has_institution_permission(institution_id,'admin_documents.read')
  and exists (
    select 1 from public.admin_documents d
    where d.id=admin_document_files.document_id
      and d.institution_id=admin_document_files.institution_id
      and (
        private.has_institution_permission(d.institution_id,'admin_documents.manage')
        or d.category in ('institutional','maintenance','purchases','other')
      )
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('admin-documents-private','admin-documents-private',false,10485760,array[
  'application/pdf','image/jpeg','image/png','text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_upload_admin_document_file(p_bucket_id text,p_object_path text)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists (
    select 1
    from public.admin_document_files f
    join public.admin_documents d on d.id=f.document_id and d.institution_id=f.institution_id
    join public.memberships m on m.id=f.uploaded_by_membership_id
      and m.institution_id=f.institution_id and m.user_id=(select auth.uid()) and m.status='active'
    where f.bucket_id=p_bucket_id and f.object_path=p_object_path
      and f.upload_status='pending' and f.expires_at>now() and d.status='active'
      and private.has_institution_permission(f.institution_id,'admin_documents.manage')
  );
$function$;

create or replace function private.can_read_admin_document_file(p_bucket_id text,p_object_path text)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists (
    select 1
    from public.admin_document_files f
    join public.admin_documents d on d.id=f.document_id and d.institution_id=f.institution_id
    where f.bucket_id=p_bucket_id and f.object_path=p_object_path
      and f.upload_status='ready'
      and private.has_institution_permission(f.institution_id,'admin_documents.read')
      and (
        private.has_institution_permission(f.institution_id,'admin_documents.manage')
        or d.category in ('institutional','maintenance','purchases','other')
      )
  );
$function$;

revoke all on function private.can_upload_admin_document_file(text,text) from public,anon;
revoke all on function private.can_read_admin_document_file(text,text) from public,anon;
grant execute on function private.can_upload_admin_document_file(text,text) to authenticated;
grant execute on function private.can_read_admin_document_file(text,text) to authenticated;

create policy admin_documents_private_upload on storage.objects
for insert to authenticated with check (
  bucket_id='admin-documents-private'
  and (select private.can_upload_admin_document_file(bucket_id,name))
);
create policy admin_documents_private_read on storage.objects
for select to authenticated using (
  bucket_id='admin-documents-private'
  and (select private.can_read_admin_document_file(bucket_id,name))
);

create or replace function private.create_admin_document_impl(
  p_institution_id uuid,p_title text,p_category text,p_description text,p_reference_code text,p_document_date date
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_document_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_institution_id is null or p_title is null or length(btrim(p_title)) not between 3 and 180
    or p_description is null or length(p_description)>5000
    or p_reference_code is not null and length(p_reference_code)>80
    or p_category not in ('institutional','personnel','finance','maintenance','purchases','other')
    or p_document_date is null then
    raise exception 'Invalid document metadata' using errcode='22023';
  end if;
  select m.id into v_membership_id from public.memberships m
  where m.institution_id=p_institution_id and m.user_id=v_user_id and m.status='active'
  limit 1;
  if v_membership_id is null or not private.has_institution_permission(p_institution_id,'admin_documents.manage') then
    raise exception 'Document management access denied' using errcode='42501';
  end if;
  insert into public.admin_documents(
    id,institution_id,title,category,description,reference_code,document_date,
    created_by_membership_id,updated_by_membership_id
  ) values (
    v_document_id,p_institution_id,btrim(p_title),p_category,btrim(p_description),
    nullif(btrim(coalesce(p_reference_code,'')),''),p_document_date,v_membership_id,v_membership_id
  );
  return v_document_id;
end;
$function$;

create or replace function public.create_admin_document(
  p_institution_id uuid,p_title text,p_category text,p_description text,
  p_reference_code text,p_document_date date
)
returns uuid language sql security invoker set search_path=''
as $function$
  select private.create_admin_document_impl(
    p_institution_id,p_title,p_category,p_description,p_reference_code,p_document_date
  );
$function$;

create or replace function private.create_admin_document_file_intent_impl(
  p_document_id uuid,p_original_filename text,p_mime_type text,p_byte_size bigint
)
returns table(file_id uuid,bucket_id text,object_path text)
language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_institution_id uuid;
  v_extension text;
  v_file_id uuid := gen_random_uuid();
  v_path text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_document_id is null or p_original_filename is null
    or length(btrim(p_original_filename)) not between 1 and 180
    or position('/' in p_original_filename)>0 or position(chr(92) in p_original_filename)>0
    or p_original_filename ~ '[[:cntrl:]]'
    or p_byte_size is null or p_byte_size<1 or p_byte_size>10485760 then
    raise exception 'Invalid file metadata' using errcode='22023';
  end if;
  v_extension:=case p_mime_type
    when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png' when 'text/plain' then 'txt'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
    else null end;
  if v_extension is null then raise exception 'File type is not allowed' using errcode='22023'; end if;

  select d.institution_id,m.id into v_institution_id,v_membership_id
  from public.admin_documents d
  join public.memberships m on m.institution_id=d.institution_id
    and m.user_id=v_user_id and m.status='active'
  where d.id=p_document_id and d.status='active'
  limit 1;
  if v_membership_id is null or not private.has_institution_permission(v_institution_id,'admin_documents.manage') then
    raise exception 'Document upload access denied' using errcode='42501';
  end if;

  v_path:=format('institutions/%s/admin-documents/%s/%s.%s',v_institution_id,p_document_id,v_file_id,v_extension);
  insert into public.admin_document_files(
    id,institution_id,document_id,uploaded_by_membership_id,bucket_id,object_path,
    original_filename,mime_type,byte_size,upload_status,expires_at
  ) values (
    v_file_id,v_institution_id,p_document_id,v_membership_id,'admin-documents-private',v_path,
    btrim(p_original_filename),p_mime_type,p_byte_size,'pending',now()+interval '1 hour'
  );
  return query select v_file_id,'admin-documents-private'::text,v_path;
end;
$function$;

create or replace function public.create_admin_document_file_intent(
  p_document_id uuid,p_original_filename text,p_mime_type text,p_byte_size bigint
)
returns table(file_id uuid,bucket_id text,object_path text)
language sql security invoker set search_path=''
as $function$
  select * from private.create_admin_document_file_intent_impl(
    p_document_id,p_original_filename,p_mime_type,p_byte_size
  );
$function$;

create or replace function private.finalize_admin_document_file_impl(p_file_id uuid,p_document_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_file public.admin_document_files%rowtype;
  v_actual_size bigint;
  v_actual_mime text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select f.* into v_file
  from public.admin_document_files f
  join public.memberships m on m.id=f.uploaded_by_membership_id
    and m.institution_id=f.institution_id and m.user_id=(select auth.uid()) and m.status='active'
  where f.id=p_file_id and f.document_id=p_document_id and f.upload_status='pending' and f.expires_at>now()
    and private.has_institution_permission(f.institution_id,'admin_documents.manage')
  for update of f;
  if not found then raise exception 'Upload intent expired or unauthorized' using errcode='42501'; end if;

  select nullif(o.metadata->>'size','')::bigint,
    lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'))
  into v_actual_size,v_actual_mime
  from storage.objects o where o.bucket_id=v_file.bucket_id and o.name=v_file.object_path;
  if not found or v_actual_size is null or v_actual_mime is null
    or v_actual_size<>v_file.byte_size or v_actual_mime<>v_file.mime_type then
    raise exception 'Uploaded file metadata does not match intent' using errcode='23514';
  end if;
  update public.admin_document_files set upload_status='ready',uploaded_at=now()
  where id=v_file.id and upload_status='pending';
  return v_file.id;
end;
$function$;

create or replace function public.finalize_admin_document_file(p_file_id uuid,p_document_id uuid)
returns uuid language sql security invoker set search_path=''
as $function$
  select private.finalize_admin_document_file_impl(p_file_id,p_document_id);
$function$;

revoke all on function private.create_admin_document_impl(uuid,text,text,text,text,date) from public,anon;
revoke all on function private.create_admin_document_file_intent_impl(uuid,text,text,bigint) from public,anon;
revoke all on function private.finalize_admin_document_file_impl(uuid,uuid) from public,anon;
revoke all on function public.create_admin_document(uuid,text,text,text,text,date) from public,anon;
revoke all on function public.create_admin_document_file_intent(uuid,text,text,bigint) from public,anon;
revoke all on function public.finalize_admin_document_file(uuid,uuid) from public,anon;
grant execute on function private.create_admin_document_impl(uuid,text,text,text,text,date) to authenticated;
grant execute on function private.create_admin_document_file_intent_impl(uuid,text,text,bigint) to authenticated;
grant execute on function private.finalize_admin_document_file_impl(uuid,uuid) to authenticated;
grant execute on function public.create_admin_document(uuid,text,text,text,text,date) to authenticated;
grant execute on function public.create_admin_document_file_intent(uuid,text,text,bigint) to authenticated;
grant execute on function public.finalize_admin_document_file(uuid,uuid) to authenticated;
