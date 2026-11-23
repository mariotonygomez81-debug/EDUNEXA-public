-- Allow teachers to create their own virtual classrooms only within active teaching assignments.
-- The RPCs expose no direct table access and re-check all scope inside PostgreSQL.

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

create or replace function public.list_teacher_classroom_options(p_institution_id uuid)
returns table (
  division_id uuid,
  division_label text,
  course_subject_id uuid,
  subject_label text,
  academic_year_name text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.list_teacher_classroom_options_impl(p_institution_id);
$function$;
revoke all on function public.list_teacher_classroom_options(uuid) from public,anon;
grant execute on function public.list_teacher_classroom_options(uuid) to authenticated;

create or replace function private.create_teacher_virtual_classroom_impl(
  p_institution_id uuid,
  p_division_id uuid,
  p_course_subject_id uuid,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160
     or coalesce(length(p_description),0)>2000 then
    raise exception 'Invalid classroom details' using errcode = '22023';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.institution_id=p_institution_id and m.user_id=v_user_id
    and m.status='active' and r.key='teacher'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active teacher membership required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.divisions d
    where d.id=p_division_id and d.institution_id=p_institution_id
  ) then
    raise exception 'Division does not belong to this institution' using errcode = '23503';
  end if;

  if p_course_subject_id is not null and not exists (
    select 1
    from public.course_subjects cs
    join public.divisions d on d.course_id=cs.course_id and d.institution_id=cs.institution_id
    where cs.id=p_course_subject_id and cs.institution_id=p_institution_id and d.id=p_division_id
  ) then
    raise exception 'Subject does not belong to the selected division' using errcode = '23503';
  end if;

  if not exists (
    select 1 from public.staff_assignments sa
    where sa.membership_id=v_membership_id
      and sa.institution_id=p_institution_id
      and sa.division_id=p_division_id
      and sa.assignment_type='teacher'
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
      and (sa.course_subject_id is null or sa.course_subject_id=p_course_subject_id)
  ) then
    raise exception 'Teacher is not assigned to this division and subject' using errcode = '42501';
  end if;

  insert into public.virtual_classrooms(
    institution_id,division_id,course_subject_id,title,description,created_by,owner_membership_id
  )
  values(
    p_institution_id,p_division_id,p_course_subject_id,btrim(p_title),
    nullif(btrim(p_description),''),v_user_id,v_membership_id
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.create_teacher_virtual_classroom_impl(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function private.create_teacher_virtual_classroom_impl(uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.create_teacher_virtual_classroom(
  p_institution_id uuid,
  p_division_id uuid,
  p_course_subject_id uuid,
  p_title text,
  p_description text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_teacher_virtual_classroom_impl(
    p_institution_id,p_division_id,p_course_subject_id,p_title,p_description
  );
$function$;
revoke all on function public.create_teacher_virtual_classroom(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.create_teacher_virtual_classroom(uuid,uuid,uuid,text,text) to authenticated;
