-- Allow students to contact teachers assigned to subjects they owe.
-- Existing subject-name-only records remain non-authorizing until linked by staff.
alter table public.student_previous_subjects
  add column if not exists course_subject_id uuid;

alter table public.student_previous_subjects
  add constraint student_previous_subjects_course_subject_fk
  foreign key (course_subject_id, institution_id)
  references public.course_subjects(id, institution_id)
  on delete set null (course_subject_id);

create index if not exists student_previous_subjects_course_subject_idx
  on public.student_previous_subjects (institution_id, course_subject_id)
  where course_subject_id is not null;

create or replace function private.is_staff_assigned_to_previous_subject(
  p_student_membership_id uuid,
  p_staff_membership_id uuid,
  p_institution_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.student_memberships sm
    join public.student_previous_subjects ps
      on ps.student_id=sm.student_id
      and ps.institution_id=sm.institution_id
    join public.staff_assignments sa
      on sa.course_subject_id=ps.course_subject_id
      and sa.institution_id=ps.institution_id
      and sa.membership_id=p_staff_membership_id
    where sm.membership_id=p_student_membership_id
      and sm.institution_id=p_institution_id
      and ps.course_subject_id is not null
      and ps.status in ('pending','in_progress')
      and sa.assignment_type='teacher'
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
  );
$function$;

create or replace function private.can_message_members(
  p_institution_id uuid,
  p_sender_membership_id uuid,
  p_recipient_membership_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_sender_roles text[];
  v_recipient_roles text[];
  v_sender_admin boolean;
  v_sender_staff boolean;
  v_sender_student boolean;
  v_sender_guardian boolean;
  v_recipient_admin boolean;
  v_recipient_staff boolean;
  v_recipient_student boolean;
  v_recipient_guardian boolean;
begin
  if p_institution_id is null or p_sender_membership_id is null
    or p_recipient_membership_id is null
    or p_sender_membership_id=p_recipient_membership_id then
    return false;
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.id=p_sender_membership_id and m.institution_id=p_institution_id and m.status='active'
  ) or not exists (
    select 1 from public.memberships m
    where m.id=p_recipient_membership_id and m.institution_id=p_institution_id and m.status='active'
  ) then
    return false;
  end if;

  select coalesce(array_agg(r.key),array[]::text[]) into v_sender_roles
  from public.membership_roles mr join public.roles r on r.id=mr.role_id
  where mr.membership_id=p_sender_membership_id and mr.institution_id=p_institution_id;

  select coalesce(array_agg(r.key),array[]::text[]) into v_recipient_roles
  from public.membership_roles mr join public.roles r on r.id=mr.role_id
  where mr.membership_id=p_recipient_membership_id and mr.institution_id=p_institution_id;

  v_sender_admin:=v_sender_roles && array['institution_admin','director','administrative'];
  v_sender_staff:=v_sender_roles && array['teacher','prefect'];
  v_sender_student:='student'=any(v_sender_roles);
  v_sender_guardian:='guardian'=any(v_sender_roles);
  v_recipient_admin:=v_recipient_roles && array['institution_admin','director','administrative'];
  v_recipient_staff:=v_recipient_roles && array['teacher','prefect'];
  v_recipient_student:='student'=any(v_recipient_roles);
  v_recipient_guardian:='guardian'=any(v_recipient_roles);

  if v_sender_admin or v_recipient_admin then return true; end if;
  if v_sender_staff and v_recipient_staff then return true; end if;

  if v_sender_staff and (v_recipient_student or v_recipient_guardian) then
    return exists (
      select 1 from public.enrollments e
      where e.institution_id=p_institution_id and e.status='active'
        and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
        and (
          (v_recipient_student and exists (
            select 1 from public.student_memberships sm
            where sm.student_id=e.student_id and sm.membership_id=p_recipient_membership_id
              and sm.institution_id=p_institution_id
          ))
          or
          (v_recipient_guardian and exists (
            select 1 from public.guardians g
            join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
            where g.membership_id=p_recipient_membership_id and g.institution_id=p_institution_id
              and sg.student_id=e.student_id
          ))
        )
        and private.is_staff_assigned_to_division(p_sender_membership_id,p_institution_id,e.division_id)
    );
  end if;

  if (v_sender_student or v_sender_guardian) and v_recipient_staff then
    if v_sender_student and private.is_staff_assigned_to_previous_subject(
      p_sender_membership_id,p_recipient_membership_id,p_institution_id
    ) then
      return true;
    end if;

    return exists (
      select 1 from public.enrollments e
      where e.institution_id=p_institution_id and e.status='active'
        and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
        and (
          (v_sender_student and exists (
            select 1 from public.student_memberships sm
            where sm.student_id=e.student_id and sm.membership_id=p_sender_membership_id
              and sm.institution_id=p_institution_id
          ))
          or
          (v_sender_guardian and exists (
            select 1 from public.guardians g
            join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
            where g.membership_id=p_sender_membership_id and g.institution_id=p_institution_id
              and sg.student_id=e.student_id
          ))
        )
        and private.is_staff_assigned_to_division(p_recipient_membership_id,p_institution_id,e.division_id)
    );
  end if;

  return false;
end;
$function$;

create or replace function private.list_messageable_contacts_impl(p_institution_id uuid)
returns table(membership_id uuid, display_name text, role_keys text[])
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_sender_membership_id uuid;
  v_sender_is_student boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select m.id into v_sender_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active'
  limit 1;
  if v_sender_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;

  select exists (
    select 1 from public.membership_roles mr
    join public.roles r on r.id=mr.role_id
    where mr.membership_id=v_sender_membership_id and mr.institution_id=p_institution_id
      and r.key='student'
  ) into v_sender_is_student;

  return query
  select m.id,
    coalesce(nullif(btrim(p.display_name),''),nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Usuario escolar'),
    coalesce(array_agg(distinct r.key order by r.key) filter (where r.key is not null),array[]::text[])
      || case when v_sender_is_student and private.is_staff_assigned_to_previous_subject(
        v_sender_membership_id,m.id,p_institution_id
      ) then array['previous_subject_contact']::text[] else array[]::text[] end
  from public.memberships m
  left join public.profiles p on p.id=m.user_id
  left join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  left join public.roles r on r.id=mr.role_id
  where m.institution_id=p_institution_id and m.status='active'
    and m.id<>v_sender_membership_id
    and private.can_message_members(p_institution_id,v_sender_membership_id,m.id)
  group by m.id,p.display_name,p.first_name,p.last_name
  order by 2
  limit 250;
end;
$function$;

revoke all on function private.is_staff_assigned_to_previous_subject(uuid,uuid,uuid) from public,anon;
grant execute on function private.is_staff_assigned_to_previous_subject(uuid,uuid,uuid) to authenticated;
revoke all on function private.can_message_members(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.list_messageable_contacts_impl(uuid) from public,anon;
grant execute on function private.list_messageable_contacts_impl(uuid) to authenticated;
