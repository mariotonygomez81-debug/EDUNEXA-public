create or replace function private.can_view_classroom_attendance(
  p_classroom_id uuid,
  p_institution_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.virtual_classrooms vc
    join public.memberships m
      on m.institution_id=vc.institution_id
     and m.user_id=(select auth.uid())
     and m.status='active'
    join public.membership_roles mr
      on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    where vc.id=p_classroom_id
      and vc.institution_id=p_institution_id
      and (
        (r.key in ('director','prefect','institution_admin')
          and private.can_access_classroom(p_classroom_id,p_institution_id,'classroom.read'))
        or
        (r.key='teacher'
          and private.can_access_classroom(p_classroom_id,p_institution_id,'classroom.attendance.manage'))
      )
  );
$function$;

revoke all on function private.can_view_classroom_attendance(uuid,uuid) from public, anon, authenticated;

do $migration$
declare
  v_month text;
  v_sheet text;
  v_old_condition text := $old$if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.attendance.manage') then$old$;
  v_new_condition text := $new$if v_institution_id is null or not private.can_view_classroom_attendance(p_classroom_id,v_institution_id) then$new$;
  v_old_insert text := $old$  insert into public.classroom_attendance_sessions(institution_id,classroom_id,division_id,held_on,created_by)
  values(v_institution_id,p_classroom_id,v_division_id,p_held_on,(select auth.uid()))
  on conflict(classroom_id,held_on) do nothing;$old$;
  v_new_insert text := $new$  if private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.attendance.manage') then
    insert into public.classroom_attendance_sessions(institution_id,classroom_id,division_id,held_on,created_by)
    values(v_institution_id,p_classroom_id,v_division_id,p_held_on,(select auth.uid()))
    on conflict(classroom_id,held_on) do nothing;
  end if;$new$;
begin
  select pg_get_functiondef('private.list_classroom_attendance_month_impl(uuid,date)'::regprocedure)
    into v_month;
  if position(v_old_condition in v_month)=0 then
    raise exception 'Could not locate attendance month authorization check';
  end if;
  v_month:=replace(v_month,v_old_condition,v_new_condition);
  execute v_month;

  select pg_get_functiondef('private.get_classroom_attendance_sheet_impl(uuid,date)'::regprocedure)
    into v_sheet;
  if position(v_old_condition in v_sheet)=0 or position(v_old_insert in v_sheet)=0 then
    raise exception 'Could not locate attendance sheet authorization or session creation block';
  end if;
  v_sheet:=replace(v_sheet,v_old_condition,v_new_condition);
  v_sheet:=replace(v_sheet,v_old_insert,v_new_insert);
  execute v_sheet;
end
$migration$;