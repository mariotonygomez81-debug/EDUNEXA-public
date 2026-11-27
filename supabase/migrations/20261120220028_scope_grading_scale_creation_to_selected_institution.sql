drop function public.create_grading_scale(text,text,text,numeric,numeric,numeric,jsonb);
drop function private.create_grading_scale_impl(text,text,text,numeric,numeric,numeric,jsonb);

CREATE OR REPLACE FUNCTION private.create_grading_scale_impl(p_institution_id uuid, p_name text, p_description text, p_display_mode text, p_minimum_value numeric, p_maximum_value numeric, p_passing_value numeric, p_levels jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_scale_id uuid;
  v_level jsonb;
  v_min numeric;
  v_max numeric;
  v_grade numeric;
  v_label text;
  v_is_passing boolean;
  v_order integer := 0;
  v_previous_max numeric := null;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_institution_id is null
    or p_name is null or length(btrim(p_name)) not between 2 and 80
    or (p_description is not null and length(p_description)>500)
    or p_display_mode is null or p_display_mode not in ('numeric','descriptive','both')
    or p_minimum_value is null or p_maximum_value is null or p_maximum_value<=p_minimum_value
    or (p_passing_value is not null and (p_passing_value<p_minimum_value or p_passing_value>p_maximum_value)) then
    raise exception 'Invalid grading scale configuration' using errcode='22023';
  end if;
  if jsonb_typeof(p_levels) is distinct from 'array' then
    raise exception 'Grading scale levels must be a JSON array' using errcode='22023';
  end if;
  if jsonb_array_length(p_levels) not between 2 and 20 then
    raise exception 'A grading scale must contain between 2 and 20 levels' using errcode='22023';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=v_user_id and m.institution_id=p_institution_id and m.status='active'
  limit 1;
  if v_membership_id is null
    or not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if p_display_mode in ('numeric','both') and p_passing_value is null then
    raise exception 'Numeric grading scales require a passing value' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_levels) with ordinality a(value,ord)
    join jsonb_array_elements(p_levels) with ordinality b(value,ord) on a.ord<b.ord
    where (a.value->>'minimum_percentage')::numeric <= (b.value->>'maximum_percentage')::numeric
      and (b.value->>'minimum_percentage')::numeric <= (a.value->>'maximum_percentage')::numeric
  ) then raise exception 'Grading scale percentage ranges cannot overlap' using errcode='23514'; end if;

  if exists (
    select lower(btrim(value->>'label'))
    from jsonb_array_elements(p_levels)
    group by lower(btrim(value->>'label'))
    having count(*)>1
  ) then raise exception 'Grading scale level labels must be unique' using errcode='23514'; end if;

  for v_level in
    select value from jsonb_array_elements(p_levels) as levels(value)
    order by (value->>'minimum_percentage')::numeric
  loop
    v_label:=btrim(coalesce(v_level->>'label',''));
    v_min:=(v_level->>'minimum_percentage')::numeric;
    v_max:=(v_level->>'maximum_percentage')::numeric;
    v_grade:=nullif(v_level->>'grade_value','')::numeric;
    v_is_passing:=coalesce((v_level->>'is_passing')::boolean,false);

    if length(v_label) not between 1 and 80
      or v_min<0 or v_max>100 or v_max<v_min
      or round(v_min,2)<>v_min or round(v_max,2)<>v_max
      or (p_display_mode in ('numeric','both') and v_grade is null)
      or (v_grade is not null and (v_grade<p_minimum_value or v_grade>p_maximum_value))
      or (p_passing_value is not null and v_grade is not null
        and v_is_passing is distinct from (v_grade>=p_passing_value)) then
      raise exception 'Invalid grading scale level' using errcode='22023';
    end if;

    if v_previous_max is null then
      if v_min<>0 then raise exception 'Grading scale coverage must start at 0 percent' using errcode='23514'; end if;
    elsif v_min<>v_previous_max+0.01 then
      raise exception 'Grading scale levels must be contiguous in increments of 0.01 percent' using errcode='23514';
    end if;
    v_previous_max:=v_max;
  end loop;

  if v_previous_max<>100 then
    raise exception 'Grading scale coverage must end at 100 percent' using errcode='23514';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_levels) as levels(value)
    where coalesce((value->>'is_passing')::boolean,false)
  ) or not exists (
    select 1 from jsonb_array_elements(p_levels) as levels(value)
    where not coalesce((value->>'is_passing')::boolean,false)
  ) then
    raise exception 'The scale must include passing and non-passing levels' using errcode='23514';
  end if;

  insert into public.grading_scales(
    institution_id,name,description,display_mode,minimum_value,maximum_value,passing_value
  ) values (
    p_institution_id,btrim(p_name),nullif(btrim(p_description),''),p_display_mode,
    p_minimum_value,p_maximum_value,p_passing_value
  ) returning id into v_scale_id;

  v_order:=0;
  for v_level in
    select value from jsonb_array_elements(p_levels) as levels(value)
    order by (value->>'minimum_percentage')::numeric
  loop
    v_order:=v_order+1;
    insert into public.grading_scale_levels(
      institution_id,grading_scale_id,minimum_percentage,maximum_percentage,
      label,grade_value,is_passing,sort_order
    ) values (
      p_institution_id,v_scale_id,
      (v_level->>'minimum_percentage')::numeric,
      (v_level->>'maximum_percentage')::numeric,
      btrim(v_level->>'label'),
      nullif(v_level->>'grade_value','')::numeric,
      coalesce((v_level->>'is_passing')::boolean,false),
      v_order
    );
  end loop;
  return v_scale_id;
end;
$function$
;

revoke all on function private.create_grading_scale_impl(uuid,text,text,text,numeric,numeric,numeric,jsonb) from public,anon;
grant execute on function private.create_grading_scale_impl(uuid,text,text,text,numeric,numeric,numeric,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.create_grading_scale(p_institution_id uuid, p_name text, p_description text, p_display_mode text, p_minimum_value numeric, p_maximum_value numeric, p_passing_value numeric, p_levels jsonb)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_grading_scale_impl(
    p_institution_id,p_name,p_description,p_display_mode,
    p_minimum_value,p_maximum_value,p_passing_value,p_levels
  );
$function$
;

revoke all on function public.create_grading_scale(uuid,text,text,text,numeric,numeric,numeric,jsonb) from public,anon;
grant execute on function public.create_grading_scale(uuid,text,text,text,numeric,numeric,numeric,jsonb) to authenticated;
