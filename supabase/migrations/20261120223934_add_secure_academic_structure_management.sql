create unique index if not exists courses_scope_name_unique
  on public.courses(institution_id,level_id,coalesce(grade_number,0),coalesce(shift,''),lower(name));
create unique index if not exists divisions_scope_name_unique
  on public.divisions(institution_id,course_id,academic_year_id,lower(name));
create unique index if not exists subjects_scope_name_unique
  on public.subjects(institution_id,lower(name));
create unique index if not exists staff_assignments_division_only_unique
  on public.staff_assignments(institution_id,membership_id,assignment_type,division_id)
  where division_id is not null and course_subject_id is null;
create unique index if not exists staff_assignments_subject_only_unique
  on public.staff_assignments(institution_id,membership_id,assignment_type,course_subject_id)
  where course_subject_id is not null and division_id is null;
create unique index if not exists staff_assignments_division_subject_unique
  on public.staff_assignments(institution_id,membership_id,assignment_type,division_id,course_subject_id)
  where division_id is not null and course_subject_id is not null;

CREATE OR REPLACE FUNCTION private.assign_staff_to_structure_impl(p_institution_id uuid, p_membership_id uuid, p_assignment_type text, p_division_id uuid, p_course_subject_id uuid, p_starts_on date, p_ends_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_starts_on date:=coalesce(p_starts_on,current_date);
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if p_membership_id is null or p_assignment_type not in ('teacher','prefect','director','administrative')
    or (p_ends_on is not null and p_ends_on<v_starts_on) then
    raise exception 'Invalid staff assignment data' using errcode='22023';
  end if;
  if not exists(select 1 from public.memberships m where m.id=p_membership_id and m.institution_id=p_institution_id and m.status='active')
    or not exists (
      select 1 from public.membership_roles mr
      join public.roles r on r.id=mr.role_id
      where mr.membership_id=p_membership_id and mr.institution_id=p_institution_id
        and r.key=p_assignment_type
    ) then
    raise exception 'Member is not active or does not have the selected role' using errcode='42501';
  end if;
  if p_assignment_type='teacher' and p_division_id is null and p_course_subject_id is null then
    raise exception 'A teacher assignment requires a division or course subject' using errcode='22023';
  end if;
  if p_assignment_type='prefect' and (p_division_id is null or p_course_subject_id is not null) then
    raise exception 'A prefect assignment requires a division only' using errcode='22023';
  end if;
  if p_assignment_type in ('director','administrative') and p_course_subject_id is not null then
    raise exception 'Director and administrative assignments cannot target a subject' using errcode='22023';
  end if;
  if p_division_id is not null and not exists(
    select 1 from public.divisions d where d.id=p_division_id and d.institution_id=p_institution_id
  ) then raise exception 'Division does not belong to this institution' using errcode='23503'; end if;
  if p_course_subject_id is not null and not exists(
    select 1 from public.course_subjects cs where cs.id=p_course_subject_id and cs.institution_id=p_institution_id
  ) then raise exception 'Course subject does not belong to this institution' using errcode='23503'; end if;
  if p_division_id is not null and p_course_subject_id is not null and not exists(
    select 1 from public.divisions d
    join public.course_subjects cs on cs.course_id=d.course_id and cs.institution_id=d.institution_id
    where d.id=p_division_id and d.institution_id=p_institution_id and cs.id=p_course_subject_id
  ) then raise exception 'Course subject is not part of the selected division course' using errcode='23503'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_institution_id::text||':'||p_membership_id::text||':'||p_assignment_type||':'||
      coalesce(p_division_id::text,'')||':'||coalesce(p_course_subject_id::text,''),
      0
    )
  );

  select sa.id into v_id
  from public.staff_assignments sa
  where sa.institution_id=p_institution_id
    and sa.membership_id=p_membership_id
    and sa.assignment_type=p_assignment_type
    and sa.division_id is not distinct from p_division_id
    and sa.course_subject_id is not distinct from p_course_subject_id
    and (sa.ends_on is null or sa.ends_on>=current_date)
  order by sa.created_at desc
  limit 1;

  if v_id is not null then
    update public.staff_assignments
    set starts_on=v_starts_on,ends_on=p_ends_on
    where id=v_id and institution_id=p_institution_id;
    return v_id;
  end if;

  insert into public.staff_assignments(
    institution_id,membership_id,assignment_type,division_id,course_subject_id,starts_on,ends_on
  ) values (
    p_institution_id,p_membership_id,p_assignment_type,p_division_id,p_course_subject_id,v_starts_on,p_ends_on
  ) returning id into v_id;
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.assign_subject_to_course_impl(p_institution_id uuid, p_course_id uuid, p_subject_id uuid, p_weekly_hours numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if p_weekly_hours is not null and (p_weekly_hours<=0 or p_weekly_hours>60) then
    raise exception 'Weekly hours must be greater than zero and no more than 60' using errcode='22023';
  end if;
  if not exists(select 1 from public.courses c where c.id=p_course_id and c.institution_id=p_institution_id)
    or not exists(select 1 from public.subjects s where s.id=p_subject_id and s.institution_id=p_institution_id) then
    raise exception 'Course or subject does not belong to this institution' using errcode='23503';
  end if;
  insert into public.course_subjects(institution_id,course_id,subject_id,weekly_hours)
  values(p_institution_id,p_course_id,p_subject_id,p_weekly_hours)
  on conflict(institution_id,course_id,subject_id)
  do update set weekly_hours=excluded.weekly_hours
  returning id into v_id;
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.create_course_impl(p_institution_id uuid, p_level_id uuid, p_name text, p_grade_number integer, p_shift text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if p_level_id is null or p_name is null or length(btrim(p_name)) not between 2 and 80
    or (p_grade_number is not null and p_grade_number not between 1 and 20)
    or (p_shift is not null and p_shift not in ('morning','afternoon','evening','full_day','other')) then
    raise exception 'Invalid course data' using errcode='22023';
  end if;
  if not exists(select 1 from public.education_levels el where el.id=p_level_id and el.institution_id=p_institution_id) then
    raise exception 'Education level does not belong to this institution' using errcode='23503';
  end if;
  if exists (
    select 1 from public.courses c
    where c.institution_id=p_institution_id and c.level_id=p_level_id
      and coalesce(c.grade_number,0)=coalesce(p_grade_number,0)
      and coalesce(c.shift,'')=coalesce(p_shift,'')
      and lower(c.name)=lower(btrim(p_name))
  ) then raise exception 'Course already exists' using errcode='23505'; end if;

  insert into public.courses(institution_id,level_id,name,grade_number,shift)
  values(p_institution_id,p_level_id,btrim(p_name),p_grade_number,p_shift)
  returning id into v_id;
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.create_division_impl(p_institution_id uuid, p_course_id uuid, p_academic_year_id uuid, p_campus_id uuid, p_name text, p_capacity integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if p_course_id is null or p_academic_year_id is null
    or p_name is null or length(btrim(p_name)) not between 1 and 20
    or (p_capacity is not null and p_capacity not between 1 and 2000) then
    raise exception 'Invalid division data' using errcode='22023';
  end if;
  if not exists(select 1 from public.courses c where c.id=p_course_id and c.institution_id=p_institution_id)
    or not exists(select 1 from public.academic_years ay where ay.id=p_academic_year_id and ay.institution_id=p_institution_id and ay.status<>'closed')
    or (p_campus_id is not null and not exists(select 1 from public.campuses cp where cp.id=p_campus_id and cp.institution_id=p_institution_id)) then
    raise exception 'Course, academic year or campus does not belong to this institution' using errcode='23503';
  end if;
  if exists (
    select 1 from public.divisions d
    where d.institution_id=p_institution_id and d.course_id=p_course_id
      and d.academic_year_id=p_academic_year_id and lower(d.name)=lower(btrim(p_name))
  ) then raise exception 'Division already exists for this course and year' using errcode='23505'; end if;

  insert into public.divisions(institution_id,course_id,academic_year_id,campus_id,name,capacity)
  values(p_institution_id,p_course_id,p_academic_year_id,p_campus_id,btrim(p_name),p_capacity)
  returning id into v_id;
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.create_subject_impl(p_institution_id uuid, p_name text, p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_code text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  v_code:=nullif(upper(btrim(p_code)),'');
  if p_name is null or length(btrim(p_name)) not between 2 and 80
    or (v_code is not null and v_code !~ '^[A-Z0-9_-]{2,20}$') then
    raise exception 'Invalid subject data' using errcode='22023';
  end if;
  if exists(select 1 from public.subjects s where s.institution_id=p_institution_id and lower(s.name)=lower(btrim(p_name))) then
    raise exception 'Subject already exists' using errcode='23505';
  end if;
  insert into public.subjects(institution_id,name,code)
  values(p_institution_id,btrim(p_name),v_code)
  returning id into v_id;
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.end_staff_assignment_impl(p_institution_id uuid, p_assignment_id uuid, p_ends_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_start date; v_existing_end date;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  select starts_on,ends_on into v_start,v_existing_end
  from public.staff_assignments
  where id=p_assignment_id and institution_id=p_institution_id
  for update;
  if not found then raise exception 'Staff assignment not found' using errcode='P0002'; end if;
  if p_ends_on is null or p_ends_on<v_start then
    raise exception 'End date must be on or after the assignment start date' using errcode='22023';
  end if;
  if v_existing_end is not null and p_ends_on>v_existing_end then
    raise exception 'An ended assignment cannot be extended through this action' using errcode='23514';
  end if;
  update public.staff_assignments set ends_on=p_ends_on
  where id=p_assignment_id and institution_id=p_institution_id;
  return p_assignment_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.list_assignable_staff_members_impl(p_institution_id uuid)
 RETURNS TABLE(membership_id uuid, display_name text, role_keys text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  return query
  select
    m.id,
    coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Personal sin nombre'
    ),
    coalesce(array_agg(distinct r.key order by r.key) filter (where r.key is not null),array[]::text[])
  from public.memberships m
  join public.membership_roles mr
    on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  left join public.profiles p on p.id=m.user_id
  where m.institution_id=p_institution_id
    and m.status='active'
    and r.key in ('teacher','prefect','director','administrative')
  group by m.id,p.display_name,p.first_name,p.last_name
  order by 2
  limit 500;
end;
$function$


CREATE OR REPLACE FUNCTION public.assign_staff_to_structure(p_institution_id uuid, p_membership_id uuid, p_assignment_type text, p_division_id uuid DEFAULT NULL::uuid, p_course_subject_id uuid DEFAULT NULL::uuid, p_starts_on date DEFAULT NULL::date, p_ends_on date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.assign_staff_to_structure_impl(
    p_institution_id,p_membership_id,p_assignment_type,p_division_id,p_course_subject_id,p_starts_on,p_ends_on
  );
$function$


CREATE OR REPLACE FUNCTION public.assign_subject_to_course(p_institution_id uuid, p_course_id uuid, p_subject_id uuid, p_weekly_hours numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.assign_subject_to_course_impl(p_institution_id,p_course_id,p_subject_id,p_weekly_hours);
$function$


CREATE OR REPLACE FUNCTION public.create_course(p_institution_id uuid, p_level_id uuid, p_name text, p_grade_number integer DEFAULT NULL::integer, p_shift text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_course_impl(p_institution_id,p_level_id,p_name,p_grade_number,p_shift);
$function$


CREATE OR REPLACE FUNCTION public.create_division(p_institution_id uuid, p_course_id uuid, p_academic_year_id uuid, p_campus_id uuid, p_name text, p_capacity integer)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_division_impl(p_institution_id,p_course_id,p_academic_year_id,p_campus_id,p_name,p_capacity);
$function$


CREATE OR REPLACE FUNCTION public.create_subject(p_institution_id uuid, p_name text, p_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_subject_impl(p_institution_id,p_name,p_code);
$function$


CREATE OR REPLACE FUNCTION public.end_staff_assignment(p_institution_id uuid, p_assignment_id uuid, p_ends_on date)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.end_staff_assignment_impl(p_institution_id,p_assignment_id,p_ends_on);
$function$


CREATE OR REPLACE FUNCTION public.list_assignable_staff_members(p_institution_id uuid)
 RETURNS TABLE(membership_id uuid, display_name text, role_keys text[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.list_assignable_staff_members_impl(p_institution_id);
$function$


revoke all on function private.list_assignable_staff_members_impl(uuid) from public,anon;
grant execute on function private.list_assignable_staff_members_impl(uuid) to authenticated;
revoke all on function private.create_course_impl(uuid,uuid,text,integer,text) from public,anon;
grant execute on function private.create_course_impl(uuid,uuid,text,integer,text) to authenticated;
revoke all on function private.create_division_impl(uuid,uuid,uuid,uuid,text,integer) from public,anon;
grant execute on function private.create_division_impl(uuid,uuid,uuid,uuid,text,integer) to authenticated;
revoke all on function private.create_subject_impl(uuid,text,text) from public,anon;
grant execute on function private.create_subject_impl(uuid,text,text) to authenticated;
revoke all on function private.assign_subject_to_course_impl(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function private.assign_subject_to_course_impl(uuid,uuid,uuid,numeric) to authenticated;
revoke all on function private.assign_staff_to_structure_impl(uuid,uuid,text,uuid,uuid,date,date) from public,anon;
grant execute on function private.assign_staff_to_structure_impl(uuid,uuid,text,uuid,uuid,date,date) to authenticated;
revoke all on function private.end_staff_assignment_impl(uuid,uuid,date) from public,anon;
grant execute on function private.end_staff_assignment_impl(uuid,uuid,date) to authenticated;
revoke all on function public.list_assignable_staff_members(uuid) from public,anon;
grant execute on function public.list_assignable_staff_members(uuid) to authenticated;
revoke all on function public.create_course(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.create_course(uuid,uuid,text,integer,text) to authenticated;
revoke all on function public.create_division(uuid,uuid,uuid,uuid,text,integer) from public,anon;
grant execute on function public.create_division(uuid,uuid,uuid,uuid,text,integer) to authenticated;
revoke all on function public.create_subject(uuid,text,text) from public,anon;
grant execute on function public.create_subject(uuid,text,text) to authenticated;
revoke all on function public.assign_subject_to_course(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.assign_subject_to_course(uuid,uuid,uuid,numeric) to authenticated;
revoke all on function public.assign_staff_to_structure(uuid,uuid,text,uuid,uuid,date,date) from public,anon;
grant execute on function public.assign_staff_to_structure(uuid,uuid,text,uuid,uuid,date,date) to authenticated;
revoke all on function public.end_staff_assignment(uuid,uuid,date) from public,anon;
grant execute on function public.end_staff_assignment(uuid,uuid,date) to authenticated;

revoke insert,update,delete on table public.courses,public.divisions,public.subjects,public.course_subjects,public.staff_assignments from public,anon,authenticated;
grant select on table public.courses,public.divisions,public.subjects,public.course_subjects,public.staff_assignments to authenticated;
