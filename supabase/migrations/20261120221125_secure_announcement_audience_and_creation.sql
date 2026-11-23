create or replace function private.can_read_announcement(
  p_announcement_id uuid,
  p_institution_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_audience text;
  v_division_id uuid;
  v_published_at timestamptz;
  v_expires_at timestamptz;
  v_membership_id uuid;
  v_is_admin boolean;
  v_is_staff boolean;
  v_is_student boolean;
  v_is_guardian boolean;
begin
  if (select auth.uid()) is null then return false; end if;

  select a.audience,a.division_id,a.published_at,a.expires_at
    into v_audience,v_division_id,v_published_at,v_expires_at
  from public.announcements a
  where a.id=p_announcement_id and a.institution_id=p_institution_id;

  if not found or v_published_at is null or v_published_at>now()
    or (v_expires_at is not null and v_expires_at<=now()) then
    return false;
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;
  if v_membership_id is null then return false; end if;

  select
    coalesce(bool_or(r.key in ('institution_admin','director','administrative')),false),
    coalesce(bool_or(r.key in ('institution_admin','director','administrative','teacher','prefect')),false),
    coalesce(bool_or(r.key='student'),false),
    coalesce(bool_or(r.key='guardian'),false)
  into v_is_admin,v_is_staff,v_is_student,v_is_guardian
  from public.membership_roles mr
  join public.roles r on r.id=mr.role_id
  where mr.membership_id=v_membership_id
    and mr.institution_id=p_institution_id;

  case v_audience
    when 'institution' then return true;
    when 'staff' then return v_is_staff;
    when 'families' then return v_is_guardian or v_is_admin;
    when 'students' then return v_is_student or v_is_staff;
    when 'course' then
      if v_division_id is null then return false; end if;
      if v_is_admin then return true; end if;
      if private.can_manage_division(v_division_id,p_institution_id,'communications.manage')
        or private.can_manage_division(v_division_id,p_institution_id,'attendance.read') then
        return true;
      end if;
      if v_is_student and exists (
        select 1
        from public.student_memberships sm
        join public.enrollments e
          on e.student_id=sm.student_id and e.institution_id=sm.institution_id
        where sm.membership_id=v_membership_id
          and sm.institution_id=p_institution_id
          and e.division_id=v_division_id
          and e.status='active'
          and e.enrolled_on<=current_date
          and (e.ended_on is null or e.ended_on>=current_date)
      ) then return true; end if;
      if v_is_guardian and exists (
        select 1
        from public.guardians g
        join public.student_guardians sg
          on sg.guardian_id=g.id and sg.institution_id=g.institution_id
        join public.enrollments e
          on e.student_id=sg.student_id and e.institution_id=sg.institution_id
        where g.membership_id=v_membership_id
          and g.institution_id=p_institution_id
          and e.division_id=v_division_id
          and e.status='active'
          and e.enrolled_on<=current_date
          and (e.ended_on is null or e.ended_on>=current_date)
      ) then return true; end if;
      return false;
    else
      return false;
  end case;
end;
$function$;

revoke all on function private.can_read_announcement(uuid,uuid) from public,anon;
grant execute on function private.can_read_announcement(uuid,uuid) to authenticated;

drop policy if exists announcements_member_read on public.announcements;
drop policy if exists announcements_scoped_read on public.announcements;
create policy announcements_scoped_read
on public.announcements
for select
to authenticated
using (private.can_read_announcement(id,institution_id));

revoke insert,update,delete,truncate,references,trigger on table public.announcements from anon,authenticated;

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
    coalesce(bool_or(r.key='director'),false)
  into v_is_admin,v_is_director
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
    if not (v_is_admin or v_is_director) then
      raise exception 'Only institutional administration can publish institution-wide announcements' using errcode='42501';
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

create or replace function public.create_announcement(
  p_institution_id uuid,
  p_title text,
  p_body text,
  p_audience text,
  p_division_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language sql
security invoker
set search_path=''
as $function$
  select private.create_announcement_impl(
    p_institution_id,p_title,p_body,p_audience,p_division_id,p_expires_at
  );
$function$;

revoke all on function public.create_announcement(uuid,text,text,text,uuid,timestamptz) from public,anon;
grant execute on function public.create_announcement(uuid,text,text,text,uuid,timestamptz) to authenticated;

create index if not exists announcements_institution_published_idx
  on public.announcements(institution_id,published_at desc)
  where published_at is not null;
create index if not exists announcements_division_scope_idx
  on public.announcements(division_id,institution_id)
  where audience='course';
