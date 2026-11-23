create or replace function private.list_classroom_files_impl(p_classroom_id uuid)
returns table (
  file_id uuid,purpose text,material_id uuid,submission_id uuid,
  original_filename text,mime_type text,byte_size bigint,object_path text,created_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_institution_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select vc.institution_id into v_institution_id from public.virtual_classrooms vc where vc.id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.read') then
    raise exception 'Classroom access denied' using errcode='42501';
  end if;
  return query
  select f.id,f.purpose,f.material_id,f.submission_id,f.original_filename,f.mime_type,f.byte_size,f.object_path,f.created_at
  from public.classroom_file_objects f
  where f.classroom_id=p_classroom_id and f.institution_id=v_institution_id
    and private.can_read_classroom_file(f.bucket_id,f.object_path)
  order by f.created_at desc;
end;
$function$;
revoke all on function private.list_classroom_files_impl(uuid) from public,anon;
grant execute on function private.list_classroom_files_impl(uuid) to authenticated;

create or replace function public.list_classroom_files(p_classroom_id uuid)
returns table (
  file_id uuid,purpose text,material_id uuid,submission_id uuid,
  original_filename text,mime_type text,byte_size bigint,object_path text,created_at timestamptz
)
language sql stable security invoker set search_path=''
as $function$
  select * from private.list_classroom_files_impl(p_classroom_id);
$function$;
revoke all on function public.list_classroom_files(uuid) from public,anon;
grant execute on function public.list_classroom_files(uuid) to authenticated;
