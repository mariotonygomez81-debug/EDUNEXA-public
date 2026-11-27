
-- Permit an authenticated administrator to recognize an already-present object
-- while a restore intent is active, and verify the stored object before completion.
create policy academic_backup_classroom_restore_read on storage.objects
for select to authenticated using(bucket_id='classroom-files' and (select private.can_restore_academic_backup_file(bucket_id,name)));
create policy academic_backup_admin_restore_read on storage.objects
for select to authenticated using(bucket_id='admin-documents-private' and (select private.can_restore_academic_backup_file(bucket_id,name)));
create policy academic_backup_support_restore_read on storage.objects
for select to authenticated using(bucket_id='support-private' and (select private.can_restore_academic_backup_file(bucket_id,name)));

create or replace function private.complete_academic_backup_storage_restore_intent_impl(p_bucket_id text,p_object_path text)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_intent public.academic_backup_storage_restore_intents%rowtype;v_size bigint;v_mime text;
begin
 select * into v_intent from public.academic_backup_storage_restore_intents i
 where i.bucket_id=p_bucket_id and i.object_path=p_object_path and i.requested_by=(select auth.uid())
  and i.completed_at is null and i.expires_at>now()
  and exists(select 1 from public.memberships m where m.institution_id=i.institution_id and m.user_id=(select auth.uid()) and m.status='active')
  and private.has_institution_permission(i.institution_id,'institution.manage')
 for update;
 if not found then raise exception 'Restore intent not found or expired' using errcode='42501'; end if;
 select nullif(o.metadata->>'size','')::bigint,lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'))
 into v_size,v_mime from storage.objects o where o.bucket_id=p_bucket_id and o.name=p_object_path;
 if not found or v_size is distinct from v_intent.byte_size or v_mime is distinct from v_intent.mime_type then
  raise exception 'Restored object metadata does not match the authorized file manifest' using errcode='23514';
 end if;
 update public.academic_backup_storage_restore_intents set completed_at=now()
 where bucket_id=p_bucket_id and object_path=p_object_path;
 return true;
end;
$function$;
revoke all on function private.complete_academic_backup_storage_restore_intent_impl(text,text) from public,anon;
grant execute on function private.complete_academic_backup_storage_restore_intent_impl(text,text) to authenticated;
