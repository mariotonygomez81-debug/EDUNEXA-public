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
        (r.key='teacher' and (
          exists(select 1 from public.staff_assignments sa
            where sa.membership_id=m.id and sa.institution_id=vc.institution_id
              and sa.assignment_type='teacher'
              and (sa.starts_on is null or sa.starts_on<=current_date)
              and (sa.ends_on is null or sa.ends_on>=current_date)
              and ((sa.course_subject_id is null and sa.division_id=vc.division_id)
                or (vc.course_subject_id is not null and sa.division_id=vc.division_id and sa.course_subject_id=vc.course_subject_id)))
          or exists(select 1 from public.classroom_teacher_permissions ctp
            where ctp.classroom_id=vc.id and ctp.institution_id=vc.institution_id
              and ctp.teacher_membership_id=m.id and ctp.is_active)
          or vc.owner_membership_id=m.id or vc.created_by=m.user_id
        ) and (
          p_permission_key='classroom.read'
          or (vc.owner_membership_id=m.id or vc.created_by=m.user_id)
          or exists(select 1 from public.classroom_teacher_permissions ctp
            where ctp.classroom_id=vc.id and ctp.institution_id=vc.institution_id
              and ctp.teacher_membership_id=m.id and ctp.is_active
              and ((p_permission_key='classroom.grade' and ctp.can_grade)
                or (p_permission_key='classroom.materials.edit' and ctp.can_edit_materials)
                or (p_permission_key='classroom.assignments.edit' and ctp.can_edit_assignments)
                or (p_permission_key='classroom.attendance.manage' and ctp.can_attendance))
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

create or replace function private.set_classroom_teacher_permissions_impl(
  p_classroom_id uuid,p_teacher_membership_id uuid,p_can_edit_materials boolean,
  p_can_edit_assignments boolean,p_can_grade boolean,p_can_attendance boolean,p_is_active boolean
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_owner uuid; v_actor uuid; v_id uuid; v_action text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select vc.institution_id,vc.owner_membership_id into v_institution_id,v_owner
  from public.virtual_classrooms vc where vc.id=p_classroom_id;
  select m.id into v_actor from public.memberships m
  where m.institution_id=v_institution_id and m.user_id=(select auth.uid()) and m.status='active';
  if v_institution_id is null or v_actor is null or not (
    v_owner=v_actor or exists(select 1 from public.virtual_classrooms vc
      where vc.id=p_classroom_id and vc.created_by=(select auth.uid()))
  ) then raise exception 'Only the classroom titular can manage auxiliary teachers' using errcode='42501'; end if;
  if p_teacher_membership_id=v_actor then raise exception 'Titular cannot be added as an auxiliary' using errcode='22023'; end if;
  if not exists(
    select 1 from public.memberships m
    join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
    join public.roles r on r.id=mr.role_id
    where m.id=p_teacher_membership_id and m.institution_id=v_institution_id
      and m.status='active' and r.key='teacher'
  ) then raise exception 'Auxiliary must be an active teacher in this institution' using errcode='42501'; end if;
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
    can_edit_materials=excluded.can_edit_materials,can_edit_assignments=excluded.can_edit_assignments,
    can_grade=excluded.can_grade,can_attendance=excluded.can_attendance,
    is_active=excluded.is_active,granted_by_membership_id=excluded.granted_by_membership_id,updated_at=now()
  returning id into v_id;
  insert into public.classroom_teacher_permission_events(
    institution_id,classroom_id,teacher_membership_id,changed_by_membership_id,action,permissions
  ) values(v_institution_id,p_classroom_id,p_teacher_membership_id,v_actor,v_action,
    jsonb_build_object('can_edit_materials',coalesce(p_can_edit_materials,false),
      'can_edit_assignments',coalesce(p_can_edit_assignments,false),'can_grade',coalesce(p_can_grade,false),
      'can_attendance',coalesce(p_can_attendance,false),'is_active',coalesce(p_is_active,false)));
  return v_id;
end;
$function$;

create or replace function private.list_classroom_teacher_candidates_impl(p_classroom_id uuid)
returns table(teacher_membership_id uuid,teacher_name text,is_auxiliary boolean,
  can_edit_materials boolean,can_edit_assignments boolean,can_grade boolean,can_attendance boolean)
language plpgsql stable security definer set search_path=''
as $function$
declare v_institution_id uuid; v_owner uuid;
begin
  select institution_id,owner_membership_id into v_institution_id,v_owner
  from public.virtual_classrooms where id=p_classroom_id;
  if (select auth.uid()) is null or v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'Only the classroom titular can manage auxiliary teachers' using errcode='42501';
  end if;
  return query
  select m.id,coalesce(nullif(p.display_name,''),concat_ws(' ',p.first_name,p.last_name)),
    coalesce(ctp.is_active,false),coalesce(ctp.can_edit_materials,false),
    coalesce(ctp.can_edit_assignments,false),coalesce(ctp.can_grade,false),coalesce(ctp.can_attendance,false)
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id and r.key='teacher'
  join public.profiles p on p.id=m.user_id
  left join public.classroom_teacher_permissions ctp on ctp.classroom_id=p_classroom_id and ctp.teacher_membership_id=m.id
  where m.institution_id=v_institution_id and m.status='active' and m.id<>v_owner
  group by m.id,p.display_name,p.first_name,p.last_name,ctp.is_active,ctp.can_edit_materials,ctp.can_edit_assignments,ctp.can_grade,ctp.can_attendance
  order by p.last_name,p.first_name;
end;
$function$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('private.list_classroom_people_impl(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    'from public.staff_assignments sa',
    'from (
      select sa.membership_id,sa.institution_id,sa.assignment_type,sa.division_id,sa.course_subject_id,sa.starts_on,sa.ends_on
      from public.staff_assignments sa
      union all
      select ctp.teacher_membership_id,ctp.institution_id,''assistant''::text,vc.division_id,vc.course_subject_id,current_date,null::date
      from public.classroom_teacher_permissions ctp
      join public.virtual_classrooms vc on vc.id=ctp.classroom_id and vc.institution_id=ctp.institution_id
      where ctp.is_active
    ) sa');
  execute v_def;
end $$;
