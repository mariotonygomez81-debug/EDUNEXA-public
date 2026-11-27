-- Permission-scoped read model for a single classroom.
-- No direct table grants are added; public entry point is SECURITY INVOKER.
create or replace function private.get_classroom_overview_impl(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_institution_id uuid;
  v_can_manage boolean;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  select vc.institution_id
    into v_institution_id
  from public.virtual_classrooms vc
  where vc.id = p_classroom_id;

  if v_institution_id is null
     or not private.can_access_classroom(
       p_classroom_id,
       v_institution_id,
       'classroom.read'
     ) then
    return null;
  end if;

  v_can_manage :=
    private.can_access_classroom(p_classroom_id, v_institution_id, 'classroom.manage')
    or private.can_access_classroom(p_classroom_id, v_institution_id, 'classroom.grade');

  select jsonb_build_object(
    'id', vc.id,
    'institution_id', vc.institution_id,
    'division_id', vc.division_id,
    'course_subject_id', vc.course_subject_id,
    'title', vc.title,
    'description', vc.description,
    'created_at', vc.created_at,
    'division_name', d.name,
    'course_name', c.name,
    'subject_name', s.name,
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cm.id,
        'title', cm.title,
        'body', cm.body,
        'published_at', cm.published_at,
        'created_at', cm.created_at
      ) order by coalesce(cm.published_at, cm.created_at) desc)
      from public.classroom_materials cm
      where cm.classroom_id = vc.id
        and cm.institution_id = vc.institution_id
        and (v_can_manage or cm.published_at is not null)
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'title', a.title,
        'instructions', a.instructions,
        'due_at', a.due_at,
        'max_score', a.max_score,
        'published_at', a.published_at,
        'created_at', a.created_at
      ) order by coalesce(a.published_at, a.created_at) desc)
      from public.assignments a
      where a.classroom_id = vc.id
        and a.institution_id = vc.institution_id
        and (v_can_manage or a.published_at is not null)
    ), '[]'::jsonb)
  )
  into v_result
  from public.virtual_classrooms vc
  join public.divisions d
    on d.id = vc.division_id
   and d.institution_id = vc.institution_id
  join public.courses c
    on c.id = d.course_id
   and c.institution_id = d.institution_id
  left join public.course_subjects cs
    on cs.id = vc.course_subject_id
   and cs.institution_id = vc.institution_id
  left join public.subjects s
    on s.id = cs.subject_id
   and s.institution_id = cs.institution_id
  where vc.id = p_classroom_id
    and vc.institution_id = v_institution_id;

  return v_result;
end;
$function$;

revoke all on function private.get_classroom_overview_impl(uuid) from public, anon;
grant execute on function private.get_classroom_overview_impl(uuid) to authenticated;

create or replace function public.get_classroom_overview(p_classroom_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.get_classroom_overview_impl(p_classroom_id);
$function$;

revoke all on function public.get_classroom_overview(uuid) from public, anon;
grant execute on function public.get_classroom_overview(uuid) to authenticated;
