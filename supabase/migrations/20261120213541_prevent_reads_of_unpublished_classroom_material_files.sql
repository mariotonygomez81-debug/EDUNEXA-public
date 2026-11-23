create or replace function private.can_read_classroom_file(
  p_bucket_id text,p_object_path text
)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists (
    select 1 from public.classroom_file_objects f
    where f.bucket_id=p_bucket_id and f.object_path=p_object_path and f.status='ready'
      and (
        (f.purpose='material' and exists(select 1 from public.classroom_materials cm
          where cm.id=f.material_id and cm.institution_id=f.institution_id
            and cm.classroom_id=f.classroom_id and cm.file_path=f.object_path
            and (cm.published_at is not null or private.can_access_classroom(f.classroom_id,f.institution_id,'classroom.manage'))
            and private.can_access_classroom(f.classroom_id,f.institution_id,'classroom.read')))
        or
        (f.purpose='submission' and exists(select 1 from public.submissions s
          where s.id=f.submission_id and s.institution_id=f.institution_id
            and s.file_path=f.object_path
            and private.can_access_submission(s.id,s.institution_id,'classroom.read')))
      )
  );
$function$;
