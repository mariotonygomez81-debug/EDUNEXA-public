-- Classroom invitations: secure code/link enrollment for active students.
create table if not exists public.classroom_invites (
  classroom_id uuid primary key,
  institution_id uuid not null,
  join_code text not null unique,
  join_token uuid not null default gen_random_uuid() unique,
  enabled boolean not null default true,
  expires_at timestamptz,
  created_by uuid,
  updated_at timestamptz not null default now(),
  constraint classroom_invites_classroom_fk
    foreign key (classroom_id, institution_id)
    references public.virtual_classrooms(id, institution_id) on delete cascade
);
alter table public.classroom_invites enable row level security;
drop policy if exists classroom_invites_client_block on public.classroom_invites;
create policy classroom_invites_client_block on public.classroom_invites
  for all to anon, authenticated using (false) with check (false);
revoke all on public.classroom_invites from public, anon, authenticated;

create or replace function private.get_classroom_invite_impl(p_classroom_id uuid)
returns table(join_code text, join_token uuid, enabled boolean, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare v_institution_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select institution_id into v_institution_id from public.virtual_classrooms where id=p_classroom_id;
  if v_institution_id is null then raise exception 'Classroom not found' using errcode='P0002'; end if;
  if not private.has_institution_permission(v_institution_id,'institution.manage')
     and not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage')
     and not exists(select 1 from public.virtual_classrooms vc join public.memberships m
       on m.id=vc.owner_membership_id and m.user_id=(select auth.uid()) and m.status='active'
       where vc.id=p_classroom_id) then
    raise exception 'Classroom administration permission required' using errcode='42501';
  end if;
  insert into public.classroom_invites(classroom_id,institution_id,join_code,created_by)
  values(p_classroom_id,v_institution_id,upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,10)),(select auth.uid()))
  on conflict(classroom_id) do nothing;
  return query select i.join_code,i.join_token,i.enabled,i.expires_at
    from public.classroom_invites i where i.classroom_id=p_classroom_id;
end;
$function$;
revoke all on function private.get_classroom_invite_impl(uuid) from public,anon;
grant execute on function private.get_classroom_invite_impl(uuid) to authenticated;

create or replace function public.get_classroom_invite(p_classroom_id uuid)
returns table(join_code text, join_token uuid, enabled boolean, expires_at timestamptz)
language sql security invoker set search_path = ''
as $function$ select * from private.get_classroom_invite_impl(p_classroom_id); $function$;
revoke all on function public.get_classroom_invite(uuid) from public,anon;
grant execute on function public.get_classroom_invite(uuid) to authenticated;

create or replace function private.rotate_classroom_invite_impl(p_classroom_id uuid)
returns table(join_code text, join_token uuid, enabled boolean, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare v_institution_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select institution_id into v_institution_id from public.virtual_classrooms where id=p_classroom_id;
  if v_institution_id is null then raise exception 'Classroom not found' using errcode='P0002'; end if;
  if not private.has_institution_permission(v_institution_id,'institution.manage')
     and not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage')
     and not exists(select 1 from public.virtual_classrooms vc join public.memberships m
       on m.id=vc.owner_membership_id and m.user_id=(select auth.uid()) and m.status='active'
       where vc.id=p_classroom_id) then
    raise exception 'Classroom administration permission required' using errcode='42501';
  end if;
  insert into public.classroom_invites(classroom_id,institution_id,join_code,created_by)
  values(p_classroom_id,v_institution_id,upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,10)),(select auth.uid()))
  on conflict(classroom_id) do update set
    join_code=excluded.join_code,join_token=gen_random_uuid(),enabled=true,expires_at=null,updated_at=now();
  return query select i.join_code,i.join_token,i.enabled,i.expires_at
    from public.classroom_invites i where i.classroom_id=p_classroom_id;
end;
$function$;
revoke all on function private.rotate_classroom_invite_impl(uuid) from public,anon;
grant execute on function private.rotate_classroom_invite_impl(uuid) to authenticated;

create or replace function public.rotate_classroom_invite(p_classroom_id uuid)
returns table(join_code text, join_token uuid, enabled boolean, expires_at timestamptz)
language sql security invoker set search_path = ''
as $function$ select * from private.rotate_classroom_invite_impl(p_classroom_id); $function$;
revoke all on function public.rotate_classroom_invite(uuid) from public,anon;
grant execute on function public.rotate_classroom_invite(uuid) to authenticated;

create or replace function private.join_classroom_by_invite_impl(p_code text,p_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_classroom_id uuid; v_institution_id uuid;
  v_division_id uuid; v_membership_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select i.classroom_id,i.institution_id,vc.division_id into v_classroom_id,v_institution_id,v_division_id
  from public.classroom_invites i
  join public.virtual_classrooms vc on vc.id=i.classroom_id and vc.institution_id=i.institution_id
  where i.enabled and (i.expires_at is null or i.expires_at>now())
    and ((p_code is not null and upper(btrim(p_code))=i.join_code)
      or (p_token is not null and p_token=i.join_token))
  limit 1;
  if v_classroom_id is null then raise exception 'Invitation is invalid or expired' using errcode='22023'; end if;
  select id into v_membership_id from public.memberships
  where institution_id=v_institution_id and user_id=v_user_id and status='active';
  if v_membership_id is null then raise exception 'Active institution membership required' using errcode='42501'; end if;
  if not exists(select 1 from public.membership_roles mr join public.roles r on r.id=mr.role_id
    where mr.membership_id=v_membership_id and mr.institution_id=v_institution_id and r.key='student')
    or not exists(select 1 from public.student_memberships sm
      join public.enrollments e on e.student_id=sm.student_id and e.institution_id=sm.institution_id
      where sm.membership_id=v_membership_id and sm.institution_id=v_institution_id
        and e.division_id=v_division_id and e.status='active'
        and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)) then
    raise exception 'Only an actively enrolled student in this division can join' using errcode='42501';
  end if;
  insert into public.classroom_members(classroom_id,institution_id,membership_id,member_role)
  values(v_classroom_id,v_institution_id,v_membership_id,'student')
  on conflict(classroom_id,membership_id) do nothing;
  return v_classroom_id;
end;
$function$;
revoke all on function private.join_classroom_by_invite_impl(text,uuid) from public,anon;
grant execute on function private.join_classroom_by_invite_impl(text,uuid) to authenticated;

create or replace function public.join_classroom_by_invite(p_code text default null,p_token uuid default null)
returns uuid language sql security invoker set search_path = ''
as $function$ select private.join_classroom_by_invite_impl(p_code,p_token); $function$;
revoke all on function public.join_classroom_by_invite(text,uuid) from public,anon;
grant execute on function public.join_classroom_by_invite(text,uuid) to authenticated;

-- Existing active students keep their current access when the invitation workflow is enabled.
insert into public.classroom_members(classroom_id,institution_id,membership_id,member_role)
select distinct vc.id,vc.institution_id,sm.membership_id,'student'
from public.virtual_classrooms vc
join public.student_memberships sm on sm.institution_id=vc.institution_id
join public.enrollments e on e.student_id=sm.student_id and e.institution_id=vc.institution_id
where e.division_id=vc.division_id and e.status='active'
  and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
on conflict(classroom_id,membership_id) do nothing;

create or replace function private.can_access_classroom(p_classroom_id uuid,p_institution_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists(
    select 1 from public.virtual_classrooms vc
    join public.memberships m on m.institution_id=vc.institution_id and m.user_id=(select auth.uid()) and m.status='active'
    join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    where vc.id=p_classroom_id and vc.institution_id=p_institution_id
      and private.has_institution_permission(p_institution_id,
        case when p_permission_key in ('classroom.materials.edit','classroom.assignments.edit','classroom.attendance.manage')
          then 'classroom.read' else p_permission_key end)
      and (
        (r.key='institution_admin' and p_permission_key='classroom.read')
        or (r.key in ('director','prefect') and p_permission_key='classroom.read')
        or (r.key='teacher' and (
          exists(select 1 from public.staff_assignments sa where sa.membership_id=m.id and sa.institution_id=vc.institution_id
            and sa.assignment_type='teacher' and (sa.starts_on is null or sa.starts_on<=current_date)
            and (sa.ends_on is null or sa.ends_on>=current_date)
            and ((sa.course_subject_id is null and sa.division_id=vc.division_id)
              or (vc.course_subject_id is not null and sa.division_id=vc.division_id and sa.course_subject_id=vc.course_subject_id)))
          or exists(select 1 from public.classroom_teacher_permissions ctp where ctp.classroom_id=vc.id
            and ctp.institution_id=vc.institution_id and ctp.teacher_membership_id=m.id and ctp.is_active)
          or vc.owner_membership_id=m.id or vc.created_by=m.user_id
        ) and (p_permission_key='classroom.read' or vc.owner_membership_id=m.id or vc.created_by=m.user_id
          or exists(select 1 from public.classroom_teacher_permissions ctp where ctp.classroom_id=vc.id
            and ctp.institution_id=vc.institution_id and ctp.teacher_membership_id=m.id and ctp.is_active
            and ((p_permission_key='classroom.grade' and ctp.can_grade)
              or (p_permission_key='classroom.materials.edit' and ctp.can_edit_materials)
              or (p_permission_key='classroom.assignments.edit' and ctp.can_edit_assignments)
              or (p_permission_key='classroom.attendance.manage' and ctp.can_attendance))))
        )
        or (r.key='student' and p_permission_key in ('classroom.read','classroom.submit')
          and exists(select 1 from public.classroom_members cm where cm.classroom_id=vc.id
            and cm.institution_id=vc.institution_id and cm.membership_id=m.id and cm.member_role='student'))
        or (r.key='guardian' and p_permission_key='classroom.read' and exists(
          select 1 from public.guardians g join public.student_guardians sg
            on sg.guardian_id=g.id and sg.institution_id=g.institution_id
          join public.enrollments e on e.student_id=sg.student_id and e.institution_id=sg.institution_id
          where g.membership_id=m.id and g.institution_id=vc.institution_id and e.division_id=vc.division_id
            and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)))
      )
  );
$function$;
revoke all on function private.can_access_classroom(uuid,uuid,text) from public,anon;
grant execute on function private.can_access_classroom(uuid,uuid,text) to authenticated;
