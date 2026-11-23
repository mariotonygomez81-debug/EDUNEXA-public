create or replace function private.list_classroom_people_impl(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_institution_id uuid;
  v_division_id uuid;
  v_course_subject_id uuid;
  v_result jsonb;
begin
  if (select auth.uid()) is null then return null; end if;

  select vc.institution_id, vc.division_id, vc.course_subject_id
    into v_institution_id, v_division_id, v_course_subject_id
  from public.virtual_classrooms vc
  where vc.id = p_classroom_id;

  if v_institution_id is null or not private.can_access_classroom(
    p_classroom_id, v_institution_id, 'classroom.read'
  ) then return null; end if;

  select jsonb_build_object(
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', coalesce(nullif(p.display_name,''), concat_ws(' ',p.first_name,p.last_name)),
        'assignment', sa.assignment_type
      ) order by p.last_name, p.first_name)
      from public.staff_assignments sa
      join public.memberships m on m.id=sa.membership_id
        and m.institution_id=sa.institution_id and m.status='active'
      join public.profiles p on p.id=m.user_id
      where sa.institution_id=v_institution_id
        and sa.division_id=v_division_id
        and (sa.course_subject_id is null or sa.course_subject_id=v_course_subject_id)
        and sa.starts_on <= current_date
        and (sa.ends_on is null or sa.ends_on >= current_date)
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'name', concat_ws(' ',st.first_name,st.last_name),
        'student_number', st.student_number
      ) order by st.last_name, st.first_name)
      from public.enrollments e
      join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
      where e.institution_id=v_institution_id
        and e.division_id=v_division_id
        and e.status='active'
        and (e.ended_on is null or e.ended_on >= current_date)
        and e.enrolled_on <= current_date
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.list_classroom_people(p_classroom_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.list_classroom_people_impl(p_classroom_id);
$$;

revoke all on function public.list_classroom_people(uuid) from public, anon;
grant execute on function public.list_classroom_people(uuid) to authenticated;
