-- Preserve course orientation changes as an append-only academic history.
create table if not exists public.course_orientation_history (
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.institutions(id) on delete cascade,
 course_id uuid not null,
 previous_orientation_id uuid,
 new_orientation_id uuid,
 actor_membership_id uuid not null,
 changed_at timestamptz not null default now(),
 constraint course_orientation_history_course_fk foreign key(course_id,institution_id)
  references public.courses(id,institution_id) on delete cascade,
 constraint course_orientation_history_actor_fk foreign key(actor_membership_id,institution_id)
  references public.memberships(id,institution_id)
);
alter table public.course_orientation_history enable row level security;
revoke all on public.course_orientation_history from public,anon,authenticated;
create index if not exists course_orientation_history_course_idx
 on public.course_orientation_history(institution_id,course_id,changed_at desc);

create or replace function private.update_course_orientation_impl(
 p_institution_id uuid,p_course_id uuid,p_orientation_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=(select auth.uid());v_membership uuid;v_old uuid;v_level uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select m.id into v_membership from public.memberships m
 where m.institution_id=p_institution_id and m.user_id=v_user and m.status='active' limit 1;
 if v_membership is null or not private.has_institution_permission(p_institution_id,'institution.manage') then
  raise exception 'Institution administration permission required' using errcode='42501';
 end if;
 select c.orientation_id,c.level_id into v_old,v_level from public.courses c
 where c.id=p_course_id and c.institution_id=p_institution_id for update;
 if not found then raise exception 'Course not found in institution' using errcode='P0002'; end if;
 if p_orientation_id is not null and not exists(
  select 1 from public.education_orientations o
  where o.id=p_orientation_id and o.institution_id=p_institution_id
   and o.education_level_id=v_level and o.is_active
 ) then raise exception 'Orientation does not belong to course level or is inactive' using errcode='23503'; end if;
 if v_old is not distinct from p_orientation_id then return jsonb_build_object('course_id',p_course_id,'changed',false); end if;
 insert into public.course_orientation_history(institution_id,course_id,previous_orientation_id,new_orientation_id,actor_membership_id)
 values(p_institution_id,p_course_id,v_old,p_orientation_id,v_membership);
 update public.courses set orientation_id=p_orientation_id where id=p_course_id and institution_id=p_institution_id;
 insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_institution_id,v_user,'education.course.orientation.updated','course',p_course_id::text,
  jsonb_build_object('previous_orientation_id',v_old,'new_orientation_id',p_orientation_id));
 return jsonb_build_object('course_id',p_course_id,'changed',true);
end;
$function$;
revoke all on function private.update_course_orientation_impl(uuid,uuid,uuid) from public,anon;
grant execute on function private.update_course_orientation_impl(uuid,uuid,uuid) to authenticated;
create or replace function public.update_course_orientation(p_institution_id uuid,p_course_id uuid,p_orientation_id uuid)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.update_course_orientation_impl($1,$2,$3); $function$;
revoke all on function public.update_course_orientation(uuid,uuid,uuid) from public,anon;
grant execute on function public.update_course_orientation(uuid,uuid,uuid) to authenticated;

create or replace function public.list_institution_admin_audit_events_page(
 p_institution_id uuid,p_action text default null,p_actor_user_id uuid default null,
 p_from_date date default null,p_to_date date default null,p_offset integer default 0,p_limit integer default 25
) returns table(id bigint,actor_user_id uuid,action text,entity_type text,entity_id text,metadata jsonb,created_at timestamptz,total_count bigint)
language plpgsql security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 if p_offset<0 or p_offset>50000 or p_limit<1 or p_limit>50 or (p_from_date is not null and p_to_date is not null and p_from_date>p_to_date) then
  raise exception 'Invalid audit pagination or date range' using errcode='22023';
 end if;
 return query with filtered as (
  select a.id,a.actor_user_id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at
  from public.audit_logs a where a.institution_id=p_institution_id
   and (a.action like 'institution.profile.%' or a.action like 'education.%' or a.action='students.bulk_imported' or a.action like 'academic_year.backup.%')
   and (p_action is null or a.action=p_action) and (p_actor_user_id is null or a.actor_user_id=p_actor_user_id)
   and (p_from_date is null or a.created_at>=p_from_date::timestamptz)
   and (p_to_date is null or a.created_at<(p_to_date+1)::timestamptz)
 ) select f.*,count(*) over() from filtered f order by f.created_at desc,f.id desc offset p_offset limit p_limit;
end;
$function$;
revoke all on function public.list_institution_admin_audit_events_page(uuid,text,uuid,date,date,integer,integer) from public,anon;
grant execute on function public.list_institution_admin_audit_events_page(uuid,text,uuid,date,date,integer,integer) to authenticated;

alter function private.academic_year_snapshot(uuid,uuid) rename to academic_year_snapshot_v2;
create or replace function private.academic_year_snapshot(p_institution_id uuid,p_year_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_snapshot jsonb;v_year public.academic_years%rowtype;
begin
 select * into v_year from public.academic_years where id=p_year_id and institution_id=p_institution_id;
 if not found then raise exception 'Academic year not found' using errcode='P0002'; end if;
 v_snapshot:=private.academic_year_snapshot_v2(p_institution_id,p_year_id);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,admin_documents}',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from public.admin_documents d where d.institution_id=p_institution_id and d.document_date between v_year.starts_on and v_year.ends_on),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,admin_document_files}',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from public.admin_document_files f join public.admin_documents d on d.id=f.document_id and d.institution_id=f.institution_id where f.institution_id=p_institution_id and d.document_date between v_year.starts_on and v_year.ends_on and f.upload_status='ready'),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,classroom_file_objects}',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from public.classroom_file_objects f join public.virtual_classrooms c on c.id=f.classroom_id and c.institution_id=f.institution_id join public.divisions d on d.id=c.division_id and d.institution_id=c.institution_id where f.institution_id=p_institution_id and d.academic_year_id=p_year_id and f.status='ready'),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,support_tickets}',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.support_tickets t where t.institution_id=p_institution_id and t.created_at>=v_year.starts_on::timestamptz and t.created_at<(v_year.ends_on+1)::timestamptz),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,support_ticket_messages}',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.support_ticket_messages m where m.institution_id=p_institution_id and m.ticket_id in (select t.id from public.support_tickets t where t.institution_id=p_institution_id and t.created_at>=v_year.starts_on::timestamptz and t.created_at<(v_year.ends_on+1)::timestamptz)),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,support_ticket_attachments}',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from public.support_ticket_attachments f join public.support_tickets t on t.id=f.ticket_id and t.institution_id=f.institution_id where f.institution_id=p_institution_id and t.created_at>=v_year.starts_on::timestamptz and t.created_at<(v_year.ends_on+1)::timestamptz and f.upload_status='ready'),true);
 v_snapshot:=jsonb_set(v_snapshot,'{storage_files}',(
  select coalesce(jsonb_agg(x.item),'[]'::jsonb) from (
   select jsonb_build_object('bucket_id',f.bucket_id,'object_path',f.object_path,'original_filename',f.original_filename,'mime_type',f.mime_type,'byte_size',f.byte_size,'source_table','admin_document_files','id',f.id) item
    from public.admin_document_files f join public.admin_documents d on d.id=f.document_id and d.institution_id=f.institution_id where f.institution_id=p_institution_id and d.document_date between v_year.starts_on and v_year.ends_on and f.upload_status='ready'
   union all
   select jsonb_build_object('bucket_id',f.bucket_id,'object_path',f.object_path,'original_filename',f.original_filename,'mime_type',f.mime_type,'byte_size',f.byte_size,'source_table','classroom_file_objects','id',f.id) item
    from public.classroom_file_objects f join public.virtual_classrooms c on c.id=f.classroom_id and c.institution_id=f.institution_id join public.divisions d on d.id=c.division_id and d.institution_id=c.institution_id where f.institution_id=p_institution_id and d.academic_year_id=p_year_id and f.status='ready'
   union all
   select jsonb_build_object('bucket_id',f.storage_bucket,'object_path',f.storage_path,'original_filename',f.original_filename,'mime_type',f.mime_type,'byte_size',f.byte_size,'source_table','support_ticket_attachments','id',f.id) item
    from public.support_ticket_attachments f join public.support_tickets t on t.id=f.ticket_id and t.institution_id=f.institution_id where f.institution_id=p_institution_id and t.created_at>=v_year.starts_on::timestamptz and t.created_at<(v_year.ends_on+1)::timestamptz and f.upload_status='ready'
  ) x
 ),true);
 return v_snapshot;
end;
$function$;
revoke all on function private.academic_year_snapshot_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function private.academic_year_snapshot(uuid,uuid) from public,anon,authenticated;

alter function private.restore_academic_year_backup_impl(uuid,uuid,uuid) rename to restore_academic_year_backup_v2;
create or replace function private.restore_academic_year_backup_impl(p_institution_id uuid,p_academic_year_id uuid,p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_snapshot jsonb;v_result jsonb;
begin
 v_result:=private.restore_academic_year_backup_v2(p_institution_id,p_academic_year_id,p_backup_id);
 select snapshot into v_snapshot from public.institution_academic_backups where id=p_backup_id and institution_id=p_institution_id and academic_year_id=p_academic_year_id;
 insert into public.support_tickets select * from jsonb_populate_recordset(null::public.support_tickets,v_snapshot->'tables'->'support_tickets') on conflict do nothing;
 insert into public.support_ticket_messages select * from jsonb_populate_recordset(null::public.support_ticket_messages,v_snapshot->'tables'->'support_ticket_messages') on conflict do nothing;
 insert into public.admin_documents select * from jsonb_populate_recordset(null::public.admin_documents,v_snapshot->'tables'->'admin_documents') on conflict do nothing;
 insert into public.admin_document_files select * from jsonb_populate_recordset(null::public.admin_document_files,v_snapshot->'tables'->'admin_document_files') on conflict do nothing;
 insert into public.classroom_file_objects select * from jsonb_populate_recordset(null::public.classroom_file_objects,v_snapshot->'tables'->'classroom_file_objects') on conflict do nothing;
 insert into public.support_ticket_attachments select * from jsonb_populate_recordset(null::public.support_ticket_attachments,v_snapshot->'tables'->'support_ticket_attachments') on conflict do nothing;
 return v_result||jsonb_build_object('storage_file_count',jsonb_array_length(coalesce(v_snapshot->'storage_files','[]'::jsonb)));
end;
$function$;
revoke all on function private.restore_academic_year_backup_v2(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.restore_academic_year_backup_impl(uuid,uuid,uuid) from public,anon,authenticated;

create table if not exists public.academic_backup_storage_restore_intents(
 institution_id uuid not null references public.institutions(id) on delete cascade,
 academic_year_id uuid not null,
 requested_by uuid not null references auth.users(id),
 bucket_id text not null check(bucket_id in ('classroom-files','admin-documents-private','support-private')),
 object_path text not null,byte_size bigint not null check(byte_size between 1 and 10485760),mime_type text not null,
 expires_at timestamptz not null default now()+interval '2 hours',completed_at timestamptz,
 primary key(bucket_id,object_path),
 foreign key(academic_year_id,institution_id) references public.academic_years(id,institution_id) on delete cascade
);
alter table public.academic_backup_storage_restore_intents enable row level security;
revoke all on public.academic_backup_storage_restore_intents from public,anon,authenticated;

create or replace function private.can_download_academic_backup_file(p_bucket_id text,p_object_path text)
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists(select 1 from public.institution_academic_backups b join public.memberships m on m.institution_id=b.institution_id and m.user_id=(select auth.uid()) and m.status='active'
  where private.has_institution_permission(b.institution_id,'institution.manage') and b.snapshot->'storage_files' @> jsonb_build_array(jsonb_build_object('bucket_id',p_bucket_id,'object_path',p_object_path)));
$function$;
create or replace function private.can_restore_academic_backup_file(p_bucket_id text,p_object_path text)
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists(select 1 from public.academic_backup_storage_restore_intents i join public.memberships m on m.institution_id=i.institution_id and m.user_id=(select auth.uid()) and m.status='active'
  where i.bucket_id=p_bucket_id and i.object_path=p_object_path and i.requested_by=(select auth.uid()) and i.completed_at is null and i.expires_at>now()
   and private.has_institution_permission(i.institution_id,'institution.manage'));
$function$;
revoke all on function private.can_download_academic_backup_file(text,text) from public,anon;
revoke all on function private.can_restore_academic_backup_file(text,text) from public,anon;
grant execute on function private.can_download_academic_backup_file(text,text) to authenticated;
grant execute on function private.can_restore_academic_backup_file(text,text) to authenticated;
create policy academic_backup_classroom_files_download on storage.objects for select to authenticated using(bucket_id='classroom-files' and (select private.can_download_academic_backup_file(bucket_id,name)));
create policy academic_backup_admin_files_download on storage.objects for select to authenticated using(bucket_id='admin-documents-private' and (select private.can_download_academic_backup_file(bucket_id,name)));
create policy academic_backup_support_files_download on storage.objects for select to authenticated using(bucket_id='support-private' and (select private.can_download_academic_backup_file(bucket_id,name)));
create policy academic_backup_classroom_files_restore on storage.objects for insert to authenticated with check(bucket_id='classroom-files' and (select private.can_restore_academic_backup_file(bucket_id,name)));
create policy academic_backup_admin_files_restore on storage.objects for insert to authenticated with check(bucket_id='admin-documents-private' and (select private.can_restore_academic_backup_file(bucket_id,name)));
create policy academic_backup_support_files_restore on storage.objects for insert to authenticated with check(bucket_id='support-private' and (select private.can_restore_academic_backup_file(bucket_id,name)));

create or replace function private.create_academic_backup_storage_restore_intents_impl(p_institution_id uuid,p_academic_year_id uuid,p_snapshot jsonb)
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=(select auth.uid());v_file jsonb;v_total bigint:=0;v_count integer:=0;v_bucket text;v_path text;v_size bigint;v_mime text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 if p_snapshot->>'format'<>'EDUNEXA_ACADEMIC_BACKUP' or p_snapshot->>'institution_id'<>p_institution_id::text or p_snapshot->>'academic_year_id'<>p_academic_year_id::text or (p_snapshot->>'schema_version')::integer<>1 then raise exception 'Backup package does not match institution and academic year' using errcode='22023'; end if;
 for v_file in select value from jsonb_array_elements(coalesce(p_snapshot->'storage_files','[]'::jsonb)) loop
  v_bucket:=v_file->>'bucket_id';v_path:=v_file->>'object_path';v_size:=nullif(v_file->>'byte_size','')::bigint;v_mime:=v_file->>'mime_type';
  if v_bucket not in ('classroom-files','admin-documents-private','support-private') or v_path is null or length(v_path)>1024 or v_size is null or v_size<1 or v_size>10485760
   or v_mime not in ('application/pdf','image/jpeg','image/png','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then raise exception 'Invalid storage file metadata in backup' using errcode='22023'; end if;
  if v_bucket='classroom-files' and not exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'tables'->'classroom_file_objects','[]'::jsonb)) x where x->>'object_path'=v_path and x->>'bucket_id'=v_bucket and x->>'institution_id'=p_institution_id::text) then raise exception 'Classroom file is outside backup manifest' using errcode='42501'; end if;
  if v_bucket='admin-documents-private' and not exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'tables'->'admin_document_files','[]'::jsonb)) x where x->>'object_path'=v_path and x->>'bucket_id'=v_bucket and x->>'institution_id'=p_institution_id::text) then raise exception 'Administrative file is outside backup manifest' using errcode='42501'; end if;
  if v_bucket='support-private' and not exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'tables'->'support_ticket_attachments','[]'::jsonb)) x where x->>'storage_path'=v_path and x->>'storage_bucket'=v_bucket and x->>'institution_id'=p_institution_id::text) then raise exception 'Support file is outside backup manifest' using errcode='42501'; end if;
  v_total:=v_total+v_size;if v_total>104857600 then raise exception 'Backup files exceed 100 MB total' using errcode='22023'; end if;
  insert into public.academic_backup_storage_restore_intents(institution_id,academic_year_id,requested_by,bucket_id,object_path,byte_size,mime_type,expires_at)
  values(p_institution_id,p_academic_year_id,v_user,v_bucket,v_path,v_size,v_mime,now()+interval '2 hours')
  on conflict(bucket_id,object_path) do update set institution_id=excluded.institution_id,academic_year_id=excluded.academic_year_id,requested_by=excluded.requested_by,byte_size=excluded.byte_size,mime_type=excluded.mime_type,expires_at=excluded.expires_at,completed_at=null;
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$function$;
revoke all on function private.create_academic_backup_storage_restore_intents_impl(uuid,uuid,jsonb) from public,anon;
grant execute on function private.create_academic_backup_storage_restore_intents_impl(uuid,uuid,jsonb) to authenticated;
create or replace function public.create_academic_backup_storage_restore_intents(p_institution_id uuid,p_academic_year_id uuid,p_snapshot jsonb)
returns integer language sql security invoker set search_path=''
as $function$ select private.create_academic_backup_storage_restore_intents_impl($1,$2,$3); $function$;
revoke all on function public.create_academic_backup_storage_restore_intents(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_academic_backup_storage_restore_intents(uuid,uuid,jsonb) to authenticated;

create or replace function private.complete_academic_backup_storage_restore_intent_impl(p_bucket_id text,p_object_path text)
returns boolean language plpgsql security definer set search_path=''
as $function$
begin
 update public.academic_backup_storage_restore_intents i set completed_at=now()
 where i.bucket_id=p_bucket_id and i.object_path=p_object_path and i.requested_by=(select auth.uid()) and i.completed_at is null and i.expires_at>now()
  and exists(select 1 from public.memberships m where m.institution_id=i.institution_id and m.user_id=(select auth.uid()) and m.status='active')
  and private.has_institution_permission(i.institution_id,'institution.manage');
 if not found then raise exception 'Restore intent not found or expired' using errcode='42501'; end if;
 return true;
end;
$function$;
revoke all on function private.complete_academic_backup_storage_restore_intent_impl(text,text) from public,anon;
grant execute on function private.complete_academic_backup_storage_restore_intent_impl(text,text) to authenticated;
create or replace function public.complete_academic_backup_storage_restore_intent(p_bucket_id text,p_object_path text)
returns boolean language sql security invoker set search_path=''
as $function$ select private.complete_academic_backup_storage_restore_intent_impl($1,$2); $function$;
revoke all on function public.complete_academic_backup_storage_restore_intent(text,text) from public,anon;
grant execute on function public.complete_academic_backup_storage_restore_intent(text,text) to authenticated;
