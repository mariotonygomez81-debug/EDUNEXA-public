-- Preserve every file attached to a classroom submission.
-- Material attachments intentionally keep their single-current-file behavior.

create or replace function private.can_read_classroom_file(p_bucket_id text,p_object_path text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.classroom_file_objects f
    where f.bucket_id=p_bucket_id
      and f.object_path=p_object_path
      and f.status='ready'
      and (
        (
          f.purpose='material'
          and exists (
            select 1
            from public.classroom_materials cm
            where cm.id=f.material_id
              and cm.institution_id=f.institution_id
              and cm.classroom_id=f.classroom_id
              and cm.file_path=f.object_path
              and private.can_access_classroom(f.classroom_id,f.institution_id,'classroom.read')
          )
        )
        or
        (
          f.purpose='submission'
          and exists (
            select 1
            from public.submissions s
            where s.id=f.submission_id
              and s.institution_id=f.institution_id
              and private.can_access_submission(s.id,s.institution_id,'classroom.read')
          )
        )
      )
  );
$function$;

revoke all on function private.can_read_classroom_file(text,text) from public,anon;
grant execute on function private.can_read_classroom_file(text,text) to authenticated;

create or replace function private.finalize_classroom_file_upload_impl(p_file_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_file public.classroom_file_objects%rowtype;
  v_user_id uuid := (select auth.uid());
  v_actual_size bigint;
  v_actual_mime text;
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select f.* into v_file
  from public.classroom_file_objects f
  join public.memberships m
    on m.id=f.uploaded_by_membership_id
   and m.institution_id=f.institution_id
   and m.user_id=v_user_id
   and m.status='active'
  where f.id=p_file_id
    and f.status='pending'
    and f.expires_at>now()
  for update of f;

  if not found then
    raise exception 'Upload intent not found or expired' using errcode='42501';
  end if;

  select nullif(o.metadata->>'size','')::bigint,
    lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'))
    into v_actual_size,v_actual_mime
  from storage.objects o
  where o.bucket_id=v_file.bucket_id
    and o.name=v_file.object_path;

  if not found
    or v_actual_size is null
    or v_actual_mime is null
    or v_actual_size<>v_file.byte_size
    or v_actual_mime<>v_file.mime_type then
    raise exception 'Uploaded object metadata does not match the authorized upload intent' using errcode='23514';
  end if;

  if v_file.purpose='material' then
    if not private.can_access_classroom(v_file.classroom_id,v_file.institution_id,'classroom.manage') then
      raise exception 'Material management permission is no longer active' using errcode='42501';
    end if;

    update public.classroom_materials
       set file_path=v_file.object_path
     where id=v_file.material_id
       and institution_id=v_file.institution_id
       and classroom_id=v_file.classroom_id;
    get diagnostics v_updated=row_count;

    if v_updated<>1 then
      raise exception 'File target could not be updated' using errcode='23514';
    end if;

    -- Materials retain their existing single-current-file behavior.
    update public.classroom_file_objects
       set status='superseded'
     where id<>v_file.id
       and status='ready'
       and material_id=v_file.material_id;
  else
    if not private.can_submit_to_assignment(
      (select s.assignment_id from public.submissions s where s.id=v_file.submission_id),
      v_file.institution_id
    )
    or not exists (
      select 1
      from public.submissions s
      join public.memberships m
        on m.id=v_file.uploaded_by_membership_id
       and m.institution_id=s.institution_id
       and m.user_id=v_user_id
       and m.status='active'
      join public.student_memberships sm
        on sm.membership_id=m.id
       and sm.institution_id=m.institution_id
       and sm.student_id=s.student_id
      where s.id=v_file.submission_id
        and s.institution_id=v_file.institution_id
        and s.score is null
    ) then
      raise exception 'Assignment or student access is no longer valid for file submission' using errcode='42501';
    end if;

    -- Submission files are independent attachments. Do not overwrite submissions.file_path
    -- or supersede earlier files: both actions caused multi-file uploads to lose visibility.
    v_updated:=1;
  end if;

  update public.classroom_file_objects
     set status='ready',
         uploaded_at=now()
   where id=v_file.id
     and status='pending';

  get diagnostics v_updated=row_count;
  if v_updated<>1 then
    raise exception 'File upload could not be finalized' using errcode='23514';
  end if;

  return v_file.id;
end;
$function$;

revoke all on function private.finalize_classroom_file_upload_impl(uuid) from public,anon;
grant execute on function private.finalize_classroom_file_upload_impl(uuid) to authenticated;
