create or replace function private.create_classroom_file_upload_intent_impl(
  p_material_id uuid,p_submission_id uuid,p_original_filename text,p_mime_type text,p_byte_size bigint
)
returns table(file_id uuid,object_path text)
language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_institution_id uuid;
  v_classroom_id uuid;
  v_student_id uuid;
  v_assignment_id uuid;
  v_submission_score numeric;
  v_file_extension text;
  v_file_id uuid := gen_random_uuid();
  v_object_path text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if (p_material_id is null)=(p_submission_id is null) then
    raise exception 'Exactly one material or submission target is required' using errcode='22023';
  end if;
  if p_original_filename is null or length(btrim(p_original_filename)) not between 1 and 180
    or position('/' in p_original_filename)>0 or position(chr(92) in p_original_filename)>0
    or p_original_filename ~ '[[:cntrl:]]' then
    raise exception 'Invalid file name' using errcode='22023';
  end if;
  if p_byte_size is null or p_byte_size<1 or p_byte_size>10485760 then
    raise exception 'File size must be between 1 byte and 10 MB' using errcode='22023';
  end if;
  v_file_extension:=case p_mime_type
    when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png' when 'text/plain' then 'txt'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
    else null end;
  if v_file_extension is null then raise exception 'File type is not allowed' using errcode='22023'; end if;

  select m.id into v_membership_id from public.memberships m
  where m.user_id=v_user_id and m.status='active'
    and ((p_material_id is not null and m.institution_id=(select cm.institution_id from public.classroom_materials cm where cm.id=p_material_id))
      or (p_submission_id is not null and m.institution_id=(select s.institution_id from public.submissions s where s.id=p_submission_id)))
  limit 1;
  if v_membership_id is null then raise exception 'Active institution membership required' using errcode='42501'; end if;

  if p_material_id is not null then
    select cm.institution_id,cm.classroom_id into v_institution_id,v_classroom_id
    from public.classroom_materials cm where cm.id=p_material_id;
    if v_institution_id is null or not private.can_access_classroom(v_classroom_id,v_institution_id,'classroom.manage') then
      raise exception 'Material file upload access denied' using errcode='42501';
    end if;
    v_object_path:=format('institutions/%s/classrooms/%s/materials/%s/%s.%s',
      v_institution_id,v_classroom_id,p_material_id,v_file_id,v_file_extension);
  else
    select s.institution_id,a.classroom_id,s.student_id,s.assignment_id,s.score
      into v_institution_id,v_classroom_id,v_student_id,v_assignment_id,v_submission_score
    from public.submissions s join public.assignments a on a.id=s.assignment_id and a.institution_id=s.institution_id
    where s.id=p_submission_id;
    if v_institution_id is null or v_submission_score is not null then
      raise exception 'Submission is not available for file attachment' using errcode='42501';
    end if;
    if not private.can_submit_to_assignment(v_assignment_id,v_institution_id)
      or not exists(select 1 from public.memberships m
        join public.student_memberships sm on sm.membership_id=m.id and sm.institution_id=m.institution_id
        where m.id=v_membership_id and m.user_id=v_user_id and m.status='active'
          and sm.student_id=v_student_id and sm.institution_id=v_institution_id) then
      raise exception 'Submission file upload access denied' using errcode='42501';
    end if;
    v_object_path:=format('institutions/%s/classrooms/%s/submissions/%s/%s.%s',
      v_institution_id,v_classroom_id,p_submission_id,v_file_id,v_file_extension);
  end if;

  insert into public.classroom_file_objects(
    id,institution_id,classroom_id,material_id,submission_id,uploaded_by_membership_id,
    purpose,object_path,original_filename,mime_type,byte_size,expires_at
  ) values (
    v_file_id,v_institution_id,v_classroom_id,p_material_id,p_submission_id,v_membership_id,
    case when p_material_id is not null then 'material' else 'submission' end,
    v_object_path,btrim(p_original_filename),p_mime_type,p_byte_size,now()+interval '1 hour'
  );
  return query select v_file_id,v_object_path;
end;
$function$;

create or replace function private.finalize_classroom_file_upload_impl(p_file_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_file public.classroom_file_objects%rowtype;
  v_user_id uuid := (select auth.uid());
  v_actual_size bigint;
  v_actual_mime text;
  v_updated integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select f.* into v_file from public.classroom_file_objects f
  join public.memberships m on m.id=f.uploaded_by_membership_id and m.institution_id=f.institution_id
    and m.user_id=v_user_id and m.status='active'
  where f.id=p_file_id and f.status='pending' and f.expires_at>now()
  for update of f;
  if not found then raise exception 'Upload intent not found or expired' using errcode='42501'; end if;

  select nullif(o.metadata->>'size','')::bigint,
    lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'))
    into v_actual_size,v_actual_mime
  from storage.objects o where o.bucket_id=v_file.bucket_id and o.name=v_file.object_path;
  if not found or v_actual_size is null or v_actual_mime is null
    or v_actual_size<>v_file.byte_size or v_actual_mime<>v_file.mime_type then
    raise exception 'Uploaded object metadata does not match the authorized upload intent' using errcode='23514';
  end if;

  if v_file.purpose='material' then
    if not private.can_access_classroom(v_file.classroom_id,v_file.institution_id,'classroom.manage') then
      raise exception 'Material management permission is no longer active' using errcode='42501';
    end if;
    update public.classroom_materials set file_path=v_file.object_path
    where id=v_file.material_id and institution_id=v_file.institution_id and classroom_id=v_file.classroom_id;
    get diagnostics v_updated=row_count;
  else
    if not private.can_submit_to_assignment(
      (select s.assignment_id from public.submissions s where s.id=v_file.submission_id),v_file.institution_id
    ) or not exists(select 1 from public.submissions s
      join public.memberships m on m.id=v_file.uploaded_by_membership_id and m.institution_id=s.institution_id
        and m.user_id=v_user_id and m.status='active'
      join public.student_memberships sm on sm.membership_id=m.id and sm.institution_id=m.institution_id and sm.student_id=s.student_id
      where s.id=v_file.submission_id and s.institution_id=v_file.institution_id and s.score is null) then
      raise exception 'Assignment or student access is no longer valid for file submission' using errcode='42501';
    end if;
    update public.submissions set file_path=v_file.object_path
    where id=v_file.submission_id and institution_id=v_file.institution_id and score is null;
    get diagnostics v_updated=row_count;
  end if;
  if v_updated<>1 then raise exception 'File target could not be updated' using errcode='23514'; end if;

  update public.classroom_file_objects set status='superseded'
  where id<>v_file.id and status='ready'
    and ((v_file.material_id is not null and material_id=v_file.material_id)
      or (v_file.submission_id is not null and submission_id=v_file.submission_id));
  update public.classroom_file_objects set status='ready',uploaded_at=now() where id=v_file.id;
  return v_file.id;
end;
$function$;
