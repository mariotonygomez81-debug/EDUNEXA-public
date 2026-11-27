-- Persist virtual classroom creation and administration behind institution-scoped RPCs.
-- The virtual_classrooms table remains inaccessible directly to authenticated clients.

create or replace function private.list_institution_classrooms_impl(p_institution_id uuid)
returns table (
  classroom_id uuid, division_id uuid, course_subject_id uuid, title text, description text,
  created_at timestamptz, course_name text, division_name text, subject_name text,
  academic_year_name text, teacher_membership_id uuid, teacher_name text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not private.has_institution_permission(p_institution_id, 'institution.manage') then
    raise exception 'Institution administration permission required' using errcode = '42501';
  end if;
  return query
  select vc.id,vc.division_id,vc.course_subject_id,vc.title,vc.description,vc.created_at,
    c.name,d.name,s.name,ay.name,vc.owner_membership_id,
    nullif(btrim(concat_ws(' ',pr.first_name,pr.last_name)),'')
  from public.virtual_classrooms vc
  join public.divisions d on d.id=vc.division_id and d.institution_id=vc.institution_id
  join public.courses c on c.id=d.course_id and c.institution_id=d.institution_id
  join public.academic_years ay on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
  left join public.course_subjects cs on cs.id=vc.course_subject_id and cs.institution_id=vc.institution_id
  left join public.subjects s on s.id=cs.subject_id and s.institution_id=cs.institution_id
  left join public.memberships tm on tm.id=vc.owner_membership_id and tm.institution_id=vc.institution_id
  left join public.profiles pr on pr.id=tm.user_id
  where vc.institution_id=p_institution_id
  order by ay.starts_on desc,c.name,d.name,s.name nulls first,vc.title;
end;
$function$;

revoke all on function private.list_institution_classrooms_impl(uuid) from public,anon;
grant execute on function private.list_institution_classrooms_impl(uuid) to authenticated;

create or replace function public.list_institution_classrooms(p_institution_id uuid)
returns table (
  classroom_id uuid, division_id uuid, course_subject_id uuid, title text, description text,
  created_at timestamptz, course_name text, division_name text, subject_name text,
  academic_year_name text, teacher_membership_id uuid, teacher_name text
)
language sql stable security invoker set search_path = ''
as $function$
  select * from private.list_institution_classrooms_impl(p_institution_id);
$function$;
revoke all on function public.list_institution_classrooms(uuid) from public,anon;
grant execute on function public.list_institution_classrooms(uuid) to authenticated;

create or replace function private.create_virtual_classroom_impl(
  p_institution_id uuid,p_division_id uuid,p_course_subject_id uuid,
  p_title text,p_description text,p_owner_membership_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160
    or coalesce(length(p_description),0)>2000 then
    raise exception 'Invalid classroom details' using errcode = '22023';
  end if;
  if not exists(select 1 from public.divisions d where d.id=p_division_id and d.institution_id=p_institution_id) then
    raise exception 'Division does not belong to this institution' using errcode = '23503';
  end if;
  if p_course_subject_id is not null and not exists(
    select 1 from public.course_subjects cs
    join public.divisions d on d.course_id=cs.course_id and d.institution_id=cs.institution_id
    where cs.id=p_course_subject_id and cs.institution_id=p_institution_id and d.id=p_division_id
  ) then raise exception 'Subject does not belong to the selected division course' using errcode = '23503'; end if;
  if not exists(
    select 1 from public.memberships m
    join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    join public.staff_assignments sa on sa.membership_id=m.id and sa.institution_id=m.institution_id
    where m.id=p_owner_membership_id and m.institution_id=p_institution_id
      and m.status='active' and r.key='teacher' and sa.assignment_type='teacher'
      and sa.division_id=p_division_id
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
      and ((p_course_subject_id is null and sa.course_subject_id is null)
        or (p_course_subject_id is not null and (sa.course_subject_id is null or sa.course_subject_id=p_course_subject_id)))
  ) then raise exception 'Selected teacher is not assigned to this division and subject' using errcode = '42501'; end if;
  insert into public.virtual_classrooms(
    institution_id,division_id,course_subject_id,title,description,created_by,owner_membership_id
  ) values(p_institution_id,p_division_id,p_course_subject_id,btrim(p_title),
    nullif(btrim(p_description),''),v_user_id,p_owner_membership_id)
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function private.create_virtual_classroom_impl(uuid,uuid,uuid,text,text,uuid) from public,anon;
grant execute on function private.create_virtual_classroom_impl(uuid,uuid,uuid,text,text,uuid) to authenticated;

create or replace function public.create_virtual_classroom(
  p_institution_id uuid,p_division_id uuid,p_course_subject_id uuid,
  p_title text,p_description text,p_owner_membership_id uuid
)
returns uuid language sql security invoker set search_path = ''
as $function$
  select private.create_virtual_classroom_impl(p_institution_id,p_division_id,p_course_subject_id,p_title,p_description,p_owner_membership_id);
$function$;
revoke all on function public.create_virtual_classroom(uuid,uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.create_virtual_classroom(uuid,uuid,uuid,text,text,uuid) to authenticated;

create or replace function private.update_virtual_classroom_impl(
  p_institution_id uuid,p_classroom_id uuid,p_title text,p_description text,p_owner_membership_id uuid
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_division_id uuid;
  v_course_subject_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160
    or coalesce(length(p_description),0)>2000 then
    raise exception 'Invalid classroom details' using errcode = '22023';
  end if;
  select vc.division_id,vc.course_subject_id into v_division_id,v_course_subject_id
  from public.virtual_classrooms vc where vc.id=p_classroom_id and vc.institution_id=p_institution_id for update;
  if not found then raise exception 'Classroom not found in this institution' using errcode = '23503'; end if;
  if not exists(
    select 1 from public.memberships m
    join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    join public.staff_assignments sa on sa.membership_id=m.id and sa.institution_id=m.institution_id
    where m.id=p_owner_membership_id and m.institution_id=p_institution_id
      and m.status='active' and r.key='teacher' and sa.assignment_type='teacher'
      and sa.division_id=v_division_id
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
      and ((v_course_subject_id is null and sa.course_subject_id is null)
        or (v_course_subject_id is not null and (sa.course_subject_id is null or sa.course_subject_id=v_course_subject_id)))
  ) then raise exception 'Selected teacher is not assigned to this division and subject' using errcode = '42501'; end if;
  update public.virtual_classrooms set title=btrim(p_title),description=nullif(btrim(p_description),''),
    owner_membership_id=p_owner_membership_id
  where id=p_classroom_id and institution_id=p_institution_id;
end;
$function$;
revoke all on function private.update_virtual_classroom_impl(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function private.update_virtual_classroom_impl(uuid,uuid,text,text,uuid) to authenticated;

create or replace function public.update_virtual_classroom(
  p_institution_id uuid,p_classroom_id uuid,p_title text,p_description text,p_owner_membership_id uuid
)
returns void language sql security invoker set search_path = ''
as $function$
  select private.update_virtual_classroom_impl(p_institution_id,p_classroom_id,p_title,p_description,p_owner_membership_id);
$function$;
revoke all on function public.update_virtual_classroom(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.update_virtual_classroom(uuid,uuid,text,text,uuid) to authenticated;
