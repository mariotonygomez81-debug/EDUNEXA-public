-- Create classroom materials and assignments through narrowly scoped RPCs.
-- Direct table grants remain revoked; all authorization is rechecked in PostgreSQL.

create or replace function private.create_classroom_material_impl(
  p_classroom_id uuid,
  p_title text,
  p_body text,
  p_publish boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_institution_id uuid;
  v_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_title is null or length(btrim(p_title)) < 3 or length(btrim(p_title)) > 160
     or coalesce(length(p_body), 0) > 20000 then
    raise exception 'Invalid material content' using errcode = '22023';
  end if;

  select vc.institution_id into v_institution_id
  from public.virtual_classrooms vc
  where vc.id = p_classroom_id;

  if v_institution_id is null or not private.can_access_classroom(
    p_classroom_id, v_institution_id, 'classroom.manage'
  ) then
    raise exception 'Classroom management not permitted' using errcode = '42501';
  end if;

  insert into public.classroom_materials (
    institution_id, classroom_id, title, body, published_at, created_by
  ) values (
    v_institution_id, p_classroom_id, btrim(p_title), nullif(btrim(p_body), ''),
    case when coalesce(p_publish, false) then now() else null end, v_user_id
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.create_classroom_material_impl(uuid,text,text,boolean) from public, anon;
grant execute on function private.create_classroom_material_impl(uuid,text,text,boolean) to authenticated;

create or replace function public.create_classroom_material(
  p_classroom_id uuid,
  p_title text,
  p_body text,
  p_publish boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_classroom_material_impl(p_classroom_id, p_title, p_body, p_publish);
$function$;

revoke all on function public.create_classroom_material(uuid,text,text,boolean) from public, anon;
grant execute on function public.create_classroom_material(uuid,text,text,boolean) to authenticated;

create or replace function private.create_classroom_assignment_impl(
  p_classroom_id uuid,
  p_title text,
  p_instructions text,
  p_due_at timestamptz,
  p_max_score numeric,
  p_publish boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_institution_id uuid;
  v_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_title is null or length(btrim(p_title)) < 3 or length(btrim(p_title)) > 160
     or coalesce(length(p_instructions), 0) > 20000
     or (p_max_score is not null and (p_max_score <= 0 or p_max_score > 10000)) then
    raise exception 'Invalid assignment content' using errcode = '22023';
  end if;

  select vc.institution_id into v_institution_id
  from public.virtual_classrooms vc
  where vc.id = p_classroom_id;

  if v_institution_id is null or not private.can_access_classroom(
    p_classroom_id, v_institution_id, 'classroom.manage'
  ) then
    raise exception 'Classroom management not permitted' using errcode = '42501';
  end if;

  insert into public.assignments (
    institution_id, classroom_id, title, instructions, due_at, max_score, published_at, created_by
  ) values (
    v_institution_id, p_classroom_id, btrim(p_title), nullif(btrim(p_instructions), ''),
    p_due_at, p_max_score,
    case when coalesce(p_publish, false) then now() else null end, v_user_id
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.create_classroom_assignment_impl(uuid,text,text,timestamptz,numeric,boolean) from public, anon;
grant execute on function private.create_classroom_assignment_impl(uuid,text,text,timestamptz,numeric,boolean) to authenticated;

create or replace function public.create_classroom_assignment(
  p_classroom_id uuid,
  p_title text,
  p_instructions text,
  p_due_at timestamptz,
  p_max_score numeric,
  p_publish boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_classroom_assignment_impl(
    p_classroom_id, p_title, p_instructions, p_due_at, p_max_score, p_publish
  );
$function$;

revoke all on function public.create_classroom_assignment(uuid,text,text,timestamptz,numeric,boolean) from public, anon;
grant execute on function public.create_classroom_assignment(uuid,text,text,timestamptz,numeric,boolean) to authenticated;
