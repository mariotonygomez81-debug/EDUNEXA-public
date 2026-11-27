-- Scoped teacher editing and publication controls for classroom materials and assignments.
create or replace function private.update_classroom_material_impl(
  p_classroom_id uuid, p_material_id uuid, p_title text, p_body text, p_publish boolean
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_institution_id uuid; v_published_at timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160 or coalesce(length(p_body),0)>20000 then
    raise exception 'Invalid material content' using errcode='22023';
  end if;
  select vc.institution_id into v_institution_id from public.virtual_classrooms vc where vc.id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'Material editing not permitted' using errcode='42501';
  end if;
  select cm.published_at into v_published_at from public.classroom_materials cm
    where cm.id=p_material_id and cm.classroom_id=p_classroom_id and cm.institution_id=v_institution_id for update;
  if not found then raise exception 'Material not found in this classroom' using errcode='P0002'; end if;
  update public.classroom_materials set title=btrim(p_title),body=nullif(btrim(p_body),''),
    published_at=case when coalesce(p_publish,false) then coalesce(v_published_at,now()) else null end
  where id=p_material_id and classroom_id=p_classroom_id and institution_id=v_institution_id;
  return p_material_id;
end;
$function$;
revoke all on function private.update_classroom_material_impl(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function private.update_classroom_material_impl(uuid,uuid,text,text,boolean) to authenticated;
create or replace function public.update_classroom_material(
  p_classroom_id uuid,p_material_id uuid,p_title text,p_body text,p_publish boolean
)
returns uuid language sql security invoker set search_path=''
as $function$ select private.update_classroom_material_impl(p_classroom_id,p_material_id,p_title,p_body,p_publish); $function$;
revoke all on function public.update_classroom_material(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.update_classroom_material(uuid,uuid,text,text,boolean) to authenticated;

create or replace function private.update_classroom_assignment_impl(
  p_classroom_id uuid,p_assignment_id uuid,p_title text,p_instructions text,
  p_due_at timestamptz,p_max_score numeric,p_publish boolean
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_published_at timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160
    or coalesce(length(p_instructions),0)>20000
    or (p_max_score is not null and (p_max_score<=0 or p_max_score>10000)) then
    raise exception 'Invalid assignment content' using errcode='22023';
  end if;
  select vc.institution_id into v_institution_id from public.virtual_classrooms vc where vc.id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'Assignment editing not permitted' using errcode='42501';
  end if;
  select a.published_at into v_published_at from public.assignments a
    where a.id=p_assignment_id and a.classroom_id=p_classroom_id and a.institution_id=v_institution_id for update;
  if not found then raise exception 'Assignment not found in this classroom' using errcode='P0002'; end if;
  if exists(select 1 from public.submissions s where s.assignment_id=p_assignment_id
      and s.institution_id=v_institution_id and s.score is not null
      and (p_max_score is null or s.score>p_max_score)) then
    raise exception 'Maximum score cannot be reduced below an existing grade' using errcode='23514';
  end if;
  if not coalesce(p_publish,false) and exists(select 1 from public.submissions s
      where s.assignment_id=p_assignment_id and s.institution_id=v_institution_id and s.score is not null) then
    raise exception 'An assignment with graded submissions cannot be unpublished' using errcode='23514';
  end if;
  update public.assignments set title=btrim(p_title),instructions=nullif(btrim(p_instructions),''),
    due_at=p_due_at,max_score=p_max_score,
    published_at=case when coalesce(p_publish,false) then coalesce(v_published_at,now()) else null end
  where id=p_assignment_id and classroom_id=p_classroom_id and institution_id=v_institution_id;
  return p_assignment_id;
end;
$function$;
revoke all on function private.update_classroom_assignment_impl(uuid,uuid,text,text,timestamptz,numeric,boolean) from public,anon;
grant execute on function private.update_classroom_assignment_impl(uuid,uuid,text,text,timestamptz,numeric,boolean) to authenticated;
create or replace function public.update_classroom_assignment(
  p_classroom_id uuid,p_assignment_id uuid,p_title text,p_instructions text,
  p_due_at timestamptz,p_max_score numeric,p_publish boolean
)
returns uuid language sql security invoker set search_path=''
as $function$ select private.update_classroom_assignment_impl(
  p_classroom_id,p_assignment_id,p_title,p_instructions,p_due_at,p_max_score,p_publish
); $function$;
revoke all on function public.update_classroom_assignment(uuid,uuid,text,text,timestamptz,numeric,boolean) from public,anon;
grant execute on function public.update_classroom_assignment(uuid,uuid,text,text,timestamptz,numeric,boolean) to authenticated;
