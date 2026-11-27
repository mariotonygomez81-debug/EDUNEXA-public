-- Enable the institutional Administrative profile to publish family/student notices,
-- publish approved report cards, and communicate with staff and guardians only.

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.key in ('communications.manage','grades.read','report_cards.publish')
where r.key='administrative'
on conflict do nothing;

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

  -- Administrative staff may contact every institutional profile except students.
  if 'administrative'=any(v_sender_roles) and v_recipient_student then
    return false;
  end if;

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

create or replace function private.create_announcement_impl(
  p_institution_id uuid,
  p_title text,
  p_body text,
  p_audience text,
  p_division_id uuid,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_is_admin boolean;
  v_is_director boolean;
  v_is_administrative boolean;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_institution_id is null
    or p_title is null or length(btrim(p_title)) not between 3 and 160
    or p_body is null or length(btrim(p_body)) not between 1 and 10000
    or p_audience is null
    or p_audience not in ('institution','staff','families','students','course')
    or (p_expires_at is not null and p_expires_at<=now()) then
    raise exception 'Invalid announcement data' using errcode='22023';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=v_user_id
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;
  if v_membership_id is null
    or not private.has_institution_permission(p_institution_id,'communications.manage') then
    raise exception 'Announcement management permission required' using errcode='42501';
  end if;

  select
    coalesce(bool_or(r.key='institution_admin'),false),
    coalesce(bool_or(r.key='director'),false),
    coalesce(bool_or(r.key='administrative'),false)
  into v_is_admin,v_is_director,v_is_administrative
  from public.membership_roles mr
  join public.roles r on r.id=mr.role_id
  where mr.membership_id=v_membership_id
    and mr.institution_id=p_institution_id;

  if p_audience='course' then
    if p_division_id is null
      or not exists (
        select 1 from public.divisions d
        where d.id=p_division_id and d.institution_id=p_institution_id
      )
      or not (
        v_is_admin or v_is_director
        or private.can_manage_division(p_division_id,p_institution_id,'communications.manage')
      ) then
      raise exception 'Course announcement is outside the authorized division scope' using errcode='42501';
    end if;
  else
    if p_division_id is not null then
      raise exception 'Division can only be set for course announcements' using errcode='22023';
    end if;
    if not (
      v_is_admin or v_is_director
      or (v_is_administrative and p_audience in ('families','students'))
    ) then
      raise exception 'Only institutional administration can publish this announcement audience' using errcode='42501';
    end if;
  end if;

  insert into public.announcements(
    institution_id,title,body,audience,division_id,published_at,expires_at,created_by
  ) values (
    p_institution_id,btrim(p_title),btrim(p_body),p_audience,p_division_id,now(),p_expires_at,v_user_id
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.create_announcement_impl(uuid,text,text,text,uuid,timestamptz) from public,anon;
grant execute on function private.create_announcement_impl(uuid,text,text,text,uuid,timestamptz) to authenticated;
