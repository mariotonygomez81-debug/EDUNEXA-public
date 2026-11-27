create table if not exists public.classroom_teacher_permissions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  classroom_id uuid not null references public.virtual_classrooms(id) on delete cascade,
  teacher_membership_id uuid not null references public.memberships(id) on delete cascade,
  can_edit_materials boolean not null default false,
  can_edit_assignments boolean not null default false,
  can_grade boolean not null default false,
  can_attendance boolean not null default false,
  is_active boolean not null default true,
  granted_by_membership_id uuid not null references public.memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(classroom_id,teacher_membership_id)
);
create table if not exists public.classroom_teacher_permission_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  classroom_id uuid not null references public.virtual_classrooms(id) on delete cascade,
  teacher_membership_id uuid not null references public.memberships(id) on delete cascade,
  changed_by_membership_id uuid not null references public.memberships(id) on delete restrict,
  action text not null check(action in ('granted','updated','revoked')),
  permissions jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists classroom_teacher_permissions_lookup_idx
  on public.classroom_teacher_permissions(classroom_id,teacher_membership_id) where is_active;
alter table public.classroom_teacher_permissions enable row level security;
alter table public.classroom_teacher_permission_events enable row level security;
revoke all on public.classroom_teacher_permissions,public.classroom_teacher_permission_events from anon,authenticated;

create or replace function private.can_access_classroom(p_classroom_id uuid,p_institution_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists(
    select 1
    from public.virtual_classrooms vc
    join public.memberships m on m.institution_id=vc.institution_id and m.user_id=(select auth.uid()) and m.status='active'
    join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    where vc.id=p_classroom_id and vc.institution_id=p_institution_id
      and private.has_institution_permission(
        p_institution_id,
        case when p_permission_key in ('classroom.materials.edit','classroom.assignments.edit','classroom.attendance.manage')
          then 'classroom.read' else p_permission_key end
      )
      and (
        (r.key='institution_admin' and p_permission_key in ('classroom.read','classroom.manage','classroom.grade'))
        or
        (r.key in ('director','prefect') and p_permission_key='classroom.read')
        or
        (r.key='teacher' and exists(
          select 1 from public.staff_assignments sa
          where sa.membership_id=m.id and sa.institution_id=vc.institution_id
            and sa.assignment_type='teacher'
            and (sa.starts_on is null or sa.starts_on<=current_date)
            and (sa.ends_on is null or sa.ends_on>=current_date)
            and ((sa.course_subject_id is null and sa.division_id=vc.division_id)
              or (vc.course_subject_id is not null and sa.division_id=vc.division_id and sa.course_subject_id=vc.course_subject_id))
        ) and (
          p_permission_key='classroom.read'
          or (vc.owner_membership_id=m.id or vc.created_by=m.user_id)
          or exists(
            select 1 from public.classroom_teacher_permissions ctp
            where ctp.classroom_id=vc.id and ctp.institution_id=vc.institution_id
              and ctp.teacher_membership_id=m.id and ctp.is_active
              and (
                (p_permission_key='classroom.grade' and ctp.can_grade)
                or (p_permission_key='classroom.materials.edit' and ctp.can_edit_materials)
                or (p_permission_key='classroom.assignments.edit' and ctp.can_edit_assignments)
                or (p_permission_key='classroom.attendance.manage' and ctp.can_attendance)
              )
          )
        ))
        or
        (r.key='student' and p_permission_key in ('classroom.read','classroom.submit') and exists(
          select 1 from public.student_memberships sm
          join public.enrollments e on e.student_id=sm.student_id and e.institution_id=sm.institution_id
          where sm.membership_id=m.id and sm.institution_id=vc.institution_id and e.division_id=vc.division_id
            and e.status='active' and (e.enrolled_on is null or e.enrolled_on<=current_date)
            and (e.ended_on is null or e.ended_on>=current_date)
        ))
        or
        (r.key='guardian' and p_permission_key='classroom.read' and exists(
          select 1 from public.guardians g
          join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
          join public.enrollments e on e.student_id=sg.student_id and e.institution_id=sg.institution_id
          where g.membership_id=m.id and g.institution_id=vc.institution_id and e.division_id=vc.division_id
            and e.status='active' and (e.enrolled_on is null or e.enrolled_on<=current_date)
            and (e.ended_on is null or e.ended_on>=current_date)
        ))
      )
  );
$function$;

-- Owner-only administration of classroom staff and permission changes.
create or replace function private.set_classroom_teacher_permissions_impl(
  p_classroom_id uuid,p_teacher_membership_id uuid,p_can_edit_materials boolean,
  p_can_edit_assignments boolean,p_can_grade boolean,p_can_attendance boolean,p_is_active boolean
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_division_id uuid; v_subject_id uuid; v_owner uuid; v_actor uuid; v_id uuid; v_action text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select vc.institution_id,vc.division_id,vc.course_subject_id,vc.owner_membership_id
    into v_institution_id,v_division_id,v_subject_id,v_owner
  from public.virtual_classrooms vc where vc.id=p_classroom_id;
  select m.id into v_actor from public.memberships m
  where m.institution_id=v_institution_id and m.user_id=(select auth.uid()) and m.status='active';
  if v_institution_id is null or v_actor is null or not (v_owner=v_actor or exists(
    select 1 from public.memberships m where m.id=v_actor and m.user_id=(select auth.uid())
      and exists(select 1 from public.virtual_classrooms vc where vc.id=p_classroom_id and vc.created_by=(select auth.uid()))
  )) then
    raise exception 'Only the classroom titular can manage auxiliary teachers' using errcode='42501';
  end if;
  if p_teacher_membership_id=v_actor then raise exception 'Titular cannot be added as an auxiliary' using errcode='22023'; end if;
  if not exists(
    select 1 from public.memberships m
    join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    join public.staff_assignments sa on sa.membership_id=m.id and sa.institution_id=m.institution_id
    where m.id=p_teacher_membership_id and m.institution_id=v_institution_id and m.status='active'
      and r.key='teacher' and sa.assignment_type='teacher' and sa.division_id=v_division_id
      and (sa.course_subject_id is null or sa.course_subject_id=v_subject_id)
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
  ) then raise exception 'Auxiliary must be an active teacher assigned to this classroom' using errcode='42501'; end if;
  select id into v_id from public.classroom_teacher_permissions
    where classroom_id=p_classroom_id and teacher_membership_id=p_teacher_membership_id;
  v_action:=case when not coalesce(p_is_active,false) then 'revoked' when v_id is null then 'granted' else 'updated' end;
  insert into public.classroom_teacher_permissions(
    institution_id,classroom_id,teacher_membership_id,can_edit_materials,can_edit_assignments,
    can_grade,can_attendance,is_active,granted_by_membership_id
  ) values(v_institution_id,p_classroom_id,p_teacher_membership_id,
    coalesce(p_can_edit_materials,false),coalesce(p_can_edit_assignments,false),
    coalesce(p_can_grade,false),coalesce(p_can_attendance,false),coalesce(p_is_active,false),v_actor)
  on conflict(classroom_id,teacher_membership_id) do update set
    can_edit_materials=excluded.can_edit_materials,
    can_edit_assignments=excluded.can_edit_assignments,
    can_grade=excluded.can_grade,
    can_attendance=excluded.can_attendance,
    is_active=excluded.is_active,
    granted_by_membership_id=excluded.granted_by_membership_id,
    updated_at=now()
  returning id into v_id;
  insert into public.classroom_teacher_permission_events(
    institution_id,classroom_id,teacher_membership_id,changed_by_membership_id,action,permissions
  ) values(v_institution_id,p_classroom_id,p_teacher_membership_id,v_actor,v_action,
    jsonb_build_object('can_edit_materials',coalesce(p_can_edit_materials,false),
      'can_edit_assignments',coalesce(p_can_edit_assignments,false),
      'can_grade',coalesce(p_can_grade,false),'can_attendance',coalesce(p_can_attendance,false),
      'is_active',coalesce(p_is_active,false)));
  return v_id;
end;
$function$;

create or replace function private.list_classroom_teacher_candidates_impl(p_classroom_id uuid)
returns table(teacher_membership_id uuid,teacher_name text,is_auxiliary boolean,
  can_edit_materials boolean,can_edit_assignments boolean,can_grade boolean,can_attendance boolean)
language plpgsql stable security definer set search_path=''
as $function$
declare v_institution_id uuid; v_division_id uuid; v_subject_id uuid; v_owner uuid;
begin
  select institution_id,division_id,course_subject_id,owner_membership_id
    into v_institution_id,v_division_id,v_subject_id,v_owner
  from public.virtual_classrooms where id=p_classroom_id;
  if (select auth.uid()) is null or v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'Only the classroom titular can manage auxiliary teachers' using errcode='42501';
  end if;
  return query
  select m.id,coalesce(nullif(p.display_name,''),concat_ws(' ',p.first_name,p.last_name)),
    coalesce(ctp.is_active,false),coalesce(ctp.can_edit_materials,false),
    coalesce(ctp.can_edit_assignments,false),coalesce(ctp.can_grade,false),coalesce(ctp.can_attendance,false)
  from public.staff_assignments sa
  join public.memberships m on m.id=sa.membership_id and m.institution_id=sa.institution_id and m.status='active'
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id and r.key='teacher'
  join public.profiles p on p.id=m.user_id
  left join public.classroom_teacher_permissions ctp on ctp.classroom_id=p_classroom_id and ctp.teacher_membership_id=m.id
  where sa.institution_id=v_institution_id and sa.assignment_type='teacher'
    and sa.division_id=v_division_id and (sa.course_subject_id is null or sa.course_subject_id=v_subject_id)
    and (sa.starts_on is null or sa.starts_on<=current_date) and (sa.ends_on is null or sa.ends_on>=current_date)
    and m.id<>v_owner
  group by m.id,p.display_name,p.first_name,p.last_name,ctp.is_active,ctp.can_edit_materials,ctp.can_edit_assignments,ctp.can_grade,ctp.can_attendance
  order by p.last_name,p.first_name;
end;
$function$;

create or replace function public.set_classroom_teacher_permissions(
  p_classroom_id uuid,p_teacher_membership_id uuid,p_can_edit_materials boolean default false,
  p_can_edit_assignments boolean default false,p_can_grade boolean default false,
  p_can_attendance boolean default false,p_is_active boolean default true
)
returns uuid language sql security invoker set search_path=''
as $function$ select private.set_classroom_teacher_permissions_impl(
  p_classroom_id,p_teacher_membership_id,p_can_edit_materials,p_can_edit_assignments,p_can_grade,p_can_attendance,p_is_active
); $function$;

create or replace function public.list_classroom_teacher_candidates(p_classroom_id uuid)
returns table(teacher_membership_id uuid,teacher_name text,is_auxiliary boolean,
  can_edit_materials boolean,can_edit_assignments boolean,can_grade boolean,can_attendance boolean)
language sql stable security invoker set search_path=''
as $function$ select * from private.list_classroom_teacher_candidates_impl(p_classroom_id); $function$;

revoke all on function public.set_classroom_teacher_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean) from public,anon;
revoke all on function public.list_classroom_teacher_candidates(uuid) from public,anon;
grant execute on function public.set_classroom_teacher_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.list_classroom_teacher_candidates(uuid) to authenticated;

-- Update feature-specific operations to consult their own delegated capability.
do $$
declare v_def text;
begin
  select pg_get_functiondef('private.create_classroom_material_impl(uuid,text,text,boolean)'::regprocedure) into v_def;
  v_def:=replace(v_def,'''classroom.manage''','''classroom.materials.edit''');
  execute v_def;
  select pg_get_functiondef('private.create_classroom_assignment_impl(uuid,text,text,timestamp with time zone,numeric,boolean)'::regprocedure) into v_def;
  v_def:=replace(v_def,'''classroom.manage''','''classroom.assignments.edit''');
  execute v_def;
  select pg_get_functiondef('private.get_classroom_overview_impl(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    'private.can_access_classroom(p_classroom_id, v_institution_id, ''classroom.manage'')',
    '(private.can_access_classroom(p_classroom_id, v_institution_id, ''classroom.materials.edit'') or private.can_access_classroom(p_classroom_id, v_institution_id, ''classroom.assignments.edit''))');
  execute v_def;
  select pg_get_functiondef('private.get_classroom_attendance_sheet_impl(uuid,date)'::regprocedure) into v_def;
  v_def:=replace(v_def,'''classroom.manage''','''classroom.attendance.manage''');
  execute v_def;
  select pg_get_functiondef('private.list_classroom_attendance_month_impl(uuid,date)'::regprocedure) into v_def;
  v_def:=replace(v_def,'''classroom.manage''','''classroom.attendance.manage''');
  execute v_def;
  select pg_get_functiondef('private.save_classroom_attendance_sheet_impl(uuid,uuid,jsonb)'::regprocedure) into v_def;
  v_def:=replace(v_def,'''classroom.manage''','''classroom.attendance.manage''');
  execute v_def;
end $$;

create or replace function private.get_classroom_capabilities_impl(p_classroom_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_institution_id uuid; v_read boolean; v_manage boolean; v_grade boolean;
  v_materials boolean; v_assignments boolean; v_attendance boolean;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select institution_id into v_institution_id from public.virtual_classrooms where id=p_classroom_id;
  if v_institution_id is null then raise exception 'Classroom not found' using errcode='P0002'; end if;
  v_read:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.read');
  if not v_read then raise exception 'Classroom access denied' using errcode='42501'; end if;
  v_manage:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage');
  v_grade:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.grade');
  v_materials:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.materials.edit');
  v_assignments:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.assignments.edit');
  v_attendance:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.attendance.manage');
  return jsonb_build_object('can_read',v_read,'can_manage',v_manage,'can_grade',v_grade,
    'can_attendance',v_attendance,'can_edit_materials',v_materials,
    'can_edit_assignments',v_assignments,'can_manage_members',v_manage);
end;
$function$;
