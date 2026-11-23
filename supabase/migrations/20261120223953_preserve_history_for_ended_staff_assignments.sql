drop index if exists public.staff_assignments_division_only_unique;
drop index if exists public.staff_assignments_subject_only_unique;
drop index if exists public.staff_assignments_division_subject_unique;

create unique index staff_assignments_division_only_active_unique
  on public.staff_assignments(institution_id,membership_id,assignment_type,division_id)
  where division_id is not null and course_subject_id is null and ends_on is null;
create unique index staff_assignments_subject_only_active_unique
  on public.staff_assignments(institution_id,membership_id,assignment_type,course_subject_id)
  where course_subject_id is not null and division_id is null and ends_on is null;
create unique index staff_assignments_division_subject_active_unique
  on public.staff_assignments(institution_id,membership_id,assignment_type,division_id,course_subject_id)
  where division_id is not null and course_subject_id is not null and ends_on is null;

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


revoke all on function private.assign_staff_to_structure_impl(uuid,uuid,text,uuid,uuid,date,date) from public,anon;
grant execute on function private.assign_staff_to_structure_impl(uuid,uuid,text,uuid,uuid,date,date) to authenticated;
