create or replace function private.get_classroom_capabilities_impl(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_institution_id uuid;
  v_read boolean;
  v_manage boolean;
  v_grade boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select vc.institution_id into v_institution_id
  from public.virtual_classrooms vc where vc.id=p_classroom_id;
  if v_institution_id is null then
    raise exception 'Classroom not found' using errcode = 'P0002';
  end if;
  v_read := private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.read');
  if not v_read then
    raise exception 'Classroom access denied' using errcode = '42501';
  end if;
  v_manage := private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage');
  v_grade := private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.grade');
  return jsonb_build_object(
    'can_read',v_read,
    'can_manage',v_manage,
    'can_grade',v_grade,
    'can_attendance',v_manage
  );
end;
$function$;

create or replace function public.get_classroom_capabilities(p_classroom_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.get_classroom_capabilities_impl(p_classroom_id);
$function$;

revoke all on function public.get_classroom_capabilities(uuid) from public, anon;
grant execute on function public.get_classroom_capabilities(uuid) to authenticated;
