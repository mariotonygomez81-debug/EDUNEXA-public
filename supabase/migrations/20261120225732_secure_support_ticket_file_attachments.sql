alter table public.support_ticket_attachments
  add column if not exists upload_status text not null default 'pending'
    check (upload_status in ('pending','ready','rejected')),
  add column if not exists expires_at timestamptz not null default (now()+interval '1 hour'),
  add column if not exists uploaded_at timestamptz;

create index if not exists support_ticket_attachments_ready_idx
  on public.support_ticket_attachments(ticket_id,created_at desc)
  where upload_status='ready';
create index if not exists support_ticket_attachments_pending_expiry_idx
  on public.support_ticket_attachments(expires_at)
  where upload_status='pending';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('support-private','support-private',false,10485760,array[
  'application/pdf','image/jpeg','image/png','text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_upload_support_ticket_file(p_bucket_id text,p_object_path text)
returns boolean
language sql stable security definer set search_path=''
as $function$
  select exists(
    select 1
    from public.support_ticket_attachments a
    join public.support_tickets t
      on t.id=a.ticket_id and t.institution_id=a.institution_id
    join public.memberships m
      on m.id=a.uploaded_by_membership_id
      and m.institution_id=a.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
    where a.storage_bucket=p_bucket_id
      and a.storage_path=p_object_path
      and a.upload_status='pending'
      and a.expires_at>now()
      and t.status not in ('resolved','closed')
      and (
        t.created_by_membership_id=m.id
        or private.has_institution_permission(t.institution_id,'support.manage')
      )
  );
$function$;

create or replace function private.can_read_support_ticket_file(p_bucket_id text,p_object_path text)
returns boolean
language sql stable security definer set search_path=''
as $function$
  select exists(
    select 1
    from public.support_ticket_attachments a
    join public.support_tickets t
      on t.id=a.ticket_id and t.institution_id=a.institution_id
    join public.memberships m
      on m.institution_id=a.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
    where a.storage_bucket=p_bucket_id
      and a.storage_path=p_object_path
      and a.upload_status='ready'
      and (
        t.created_by_membership_id=m.id
        or private.has_institution_permission(t.institution_id,'support.read')
        or private.has_institution_permission(t.institution_id,'support.manage')
      )
  );
$function$;

revoke all on function private.can_upload_support_ticket_file(text,text) from public,anon;
revoke all on function private.can_read_support_ticket_file(text,text) from public,anon;
grant execute on function private.can_upload_support_ticket_file(text,text) to authenticated;
grant execute on function private.can_read_support_ticket_file(text,text) to authenticated;

drop policy if exists support_ticket_files_upload on storage.objects;
create policy support_ticket_files_upload on storage.objects
for insert to authenticated with check (
  bucket_id='support-private'
  and (select private.can_upload_support_ticket_file(bucket_id,name))
);
drop policy if exists support_ticket_files_read on storage.objects;
create policy support_ticket_files_read on storage.objects
for select to authenticated using (
  bucket_id='support-private'
  and (select private.can_read_support_ticket_file(bucket_id,name))
);

create or replace function private.create_support_ticket_attachment_intent_impl(
  p_ticket_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_byte_size bigint
)
returns table(attachment_id uuid,storage_bucket text,storage_path text)
language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_institution_id uuid;
  v_ticket_status text;
  v_creator_membership_id uuid;
  v_extension text;
  v_attachment_id uuid := gen_random_uuid();
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_ticket_id is null
    or p_original_filename is null
    or length(btrim(p_original_filename)) not between 1 and 180
    or position('/' in p_original_filename)>0
    or position(chr(92) in p_original_filename)>0
    or p_original_filename ~ '[[:cntrl:]]'
    or p_byte_size is null or p_byte_size<1 or p_byte_size>10485760 then
    raise exception 'Invalid attachment metadata' using errcode='22023';
  end if;

  v_extension:=case p_mime_type
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'text/plain' then 'txt'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
    else null end;
  if v_extension is null then
    raise exception 'Attachment type is not allowed' using errcode='22023';
  end if;

  select t.institution_id,t.status,t.created_by_membership_id,m.id
  into v_institution_id,v_ticket_status,v_creator_membership_id,v_membership_id
  from public.support_tickets t
  join public.memberships m
    on m.institution_id=t.institution_id
    and m.user_id=v_user_id
    and m.status='active'
  where t.id=p_ticket_id
  limit 1;

  if v_membership_id is null then
    raise exception 'Active institution membership required' using errcode='42501';
  end if;
  if v_ticket_status in ('resolved','closed') then
    raise exception 'Resolved or closed tickets do not accept attachments' using errcode='23514';
  end if;
  if v_creator_membership_id<>v_membership_id
    and not private.has_institution_permission(v_institution_id,'support.manage') then
    raise exception 'Ticket attachment access denied' using errcode='42501';
  end if;

  v_storage_path:=format(
    'institutions/%s/support/%s/%s.%s',
    v_institution_id,p_ticket_id,v_attachment_id,v_extension
  );

  insert into public.support_ticket_attachments(
    id,institution_id,ticket_id,message_id,uploaded_by_membership_id,
    storage_bucket,storage_path,original_filename,mime_type,byte_size,
    upload_status,expires_at
  ) values (
    v_attachment_id,v_institution_id,p_ticket_id,null,v_membership_id,
    'support-private',v_storage_path,btrim(p_original_filename),p_mime_type,p_byte_size,
    'pending',now()+interval '1 hour'
  );

  return query select v_attachment_id,'support-private'::text,v_storage_path;
end;
$function$;

create or replace function private.finalize_support_ticket_attachment_impl(p_attachment_id uuid)
returns uuid
language plpgsql security definer set search_path=''
as $function$
declare
  v_attachment public.support_ticket_attachments%rowtype;
  v_user_id uuid := (select auth.uid());
  v_actual_size bigint;
  v_actual_mime text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select a.* into v_attachment
  from public.support_ticket_attachments a
  join public.support_tickets t
    on t.id=a.ticket_id and t.institution_id=a.institution_id
  join public.memberships m
    on m.id=a.uploaded_by_membership_id
    and m.institution_id=a.institution_id
    and m.user_id=v_user_id
    and m.status='active'
  where a.id=p_attachment_id
    and a.upload_status='pending'
    and a.expires_at>now()
    and t.status not in ('resolved','closed')
    and (
      t.created_by_membership_id=m.id
      or private.has_institution_permission(t.institution_id,'support.manage')
    )
  for update of a;

  if not found then
    raise exception 'Attachment intent not found, expired, or no longer authorized' using errcode='42501';
  end if;

  select nullif(o.metadata->>'size','')::bigint,
    lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'))
  into v_actual_size,v_actual_mime
  from storage.objects o
  where o.bucket_id=v_attachment.storage_bucket
    and o.name=v_attachment.storage_path;

  if not found or v_actual_size is null or v_actual_mime is null
    or v_actual_size<>v_attachment.byte_size
    or v_actual_mime<>v_attachment.mime_type then
    raise exception 'Uploaded object metadata does not match attachment intent' using errcode='23514';
  end if;

  update public.support_ticket_attachments
  set upload_status='ready',uploaded_at=now()
  where id=v_attachment.id and upload_status='pending';

  return v_attachment.id;
end;
$function$;

create or replace function private.list_support_ticket_attachments_impl(p_ticket_id uuid)
returns table(
  id uuid,
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  byte_size bigint,
  created_at timestamptz,
  uploaded_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_institution_id uuid;
  v_creator_membership_id uuid;
  v_user_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select t.institution_id,t.created_by_membership_id,m.id
  into v_institution_id,v_creator_membership_id,v_user_membership_id
  from public.support_tickets t
  join public.memberships m
    on m.institution_id=t.institution_id
    and m.user_id=(select auth.uid())
    and m.status='active'
  where t.id=p_ticket_id
  limit 1;

  if v_user_membership_id is null then
    raise exception 'Active institution membership required' using errcode='42501';
  end if;
  if v_creator_membership_id<>v_user_membership_id
    and not private.has_institution_permission(v_institution_id,'support.read')
    and not private.has_institution_permission(v_institution_id,'support.manage') then
    raise exception 'Ticket attachment read access denied' using errcode='42501';
  end if;

  return query
  select a.id,a.storage_bucket,a.storage_path,a.original_filename,a.mime_type,
    a.byte_size,a.created_at,a.uploaded_at
  from public.support_ticket_attachments a
  where a.ticket_id=p_ticket_id
    and a.institution_id=v_institution_id
    and a.upload_status='ready'
  order by a.created_at asc
  limit 50;
end;
$function$;

create or replace function public.create_support_ticket_attachment_intent(
  p_ticket_id uuid,p_original_filename text,p_mime_type text,p_byte_size bigint
)
returns table(attachment_id uuid,storage_bucket text,storage_path text)
language sql security invoker set search_path=''
as $function$
  select * from private.create_support_ticket_attachment_intent_impl(
    p_ticket_id,p_original_filename,p_mime_type,p_byte_size
  );
$function$;

create or replace function public.finalize_support_ticket_attachment(p_attachment_id uuid)
returns uuid
language sql security invoker set search_path=''
as $function$
  select private.finalize_support_ticket_attachment_impl(p_attachment_id);
$function$;

create or replace function public.list_support_ticket_attachments(p_ticket_id uuid)
returns table(
  id uuid,storage_bucket text,storage_path text,original_filename text,
  mime_type text,byte_size bigint,created_at timestamptz,uploaded_at timestamptz
)
language sql security invoker set search_path=''
as $function$
  select * from private.list_support_ticket_attachments_impl(p_ticket_id);
$function$;

revoke all on function private.create_support_ticket_attachment_intent_impl(uuid,text,text,bigint) from public,anon;
revoke all on function private.finalize_support_ticket_attachment_impl(uuid) from public,anon;
revoke all on function private.list_support_ticket_attachments_impl(uuid) from public,anon;
grant execute on function private.create_support_ticket_attachment_intent_impl(uuid,text,text,bigint) to authenticated;
grant execute on function private.finalize_support_ticket_attachment_impl(uuid) to authenticated;
grant execute on function private.list_support_ticket_attachments_impl(uuid) to authenticated;

revoke all on function public.create_support_ticket_attachment_intent(uuid,text,text,bigint) from public,anon;
revoke all on function public.finalize_support_ticket_attachment(uuid) from public,anon;
revoke all on function public.list_support_ticket_attachments(uuid) from public,anon;
grant execute on function public.create_support_ticket_attachment_intent(uuid,text,text,bigint) to authenticated;
grant execute on function public.finalize_support_ticket_attachment(uuid) to authenticated;
grant execute on function public.list_support_ticket_attachments(uuid) to authenticated;

revoke all on table public.support_ticket_attachments from public,anon,authenticated;
