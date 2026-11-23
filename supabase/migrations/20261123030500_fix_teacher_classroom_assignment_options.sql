create or replace function private.list_teacher_classroom_options_impl(p_institution_id uuid)
returns table (
  division_id uuid,
  division_label text,
  course_subject_id uuid,
  subject_label text,
  academic_year_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.institution_id=p_institution_id
    and m.user_id=(select auth.uid())
    and m.status='active'
    and r.key='teacher'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active teacher membership required' using errcode = '42501';
  end if;

  return query
  select distinct
    d.id,
    concat_ws(' · ',c.name,d.name),
    cs.id,
    coalesce(s.name,'Aula general'),
    ay.name
  from public.staff_assignments sa
  join public.divisions d on d.id=sa.division_id and d.institution_id=sa.institution_id
  join public.courses c on c.id=d.course_id and c.institution_id=d.institution_id
  join public.academic_years ay on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
  left join public.course_subjects cs
    on cs.institution_id=d.institution_id and cs.course_id=d.course_id
    and (sa.course_subject_id is null or cs.id=sa.course_subject_id)
  left join public.subjects s on s.id=cs.subject_id and s.institution_id=cs.institution_id
  where sa.membership_id=v_membership_id
    and sa.institution_id=p_institution_id
    and sa.assignment_type='teacher'
    and (sa.starts_on is null or sa.starts_on<=current_date)
    and (sa.ends_on is null or sa.ends_on>=current_date)
  union
  select distinct d.id,concat_ws(' · ',c.name,d.name),null::uuid,'Aula general',ay.name
  from public.staff_assignments sa
  join public.divisions d on d.id=sa.division_id and d.institution_id=sa.institution_id
  join public.courses c on c.id=d.course_id and c.institution_id=d.institution_id
  join public.academic_years ay on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
  where sa.membership_id=v_membership_id
    and sa.institution_id=p_institution_id
    and sa.assignment_type='teacher'
    and sa.course_subject_id is null
    and (sa.starts_on is null or sa.starts_on<=current_date)
    and (sa.ends_on is null or sa.ends_on>=current_date)
  order by 2,4;
end;
$function$;


revoke all on function private.list_teacher_classroom_options_impl(uuid) from public,anon;
grant execute on function private.list_teacher_classroom_options_impl(uuid) to authenticated;
