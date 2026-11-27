alter table public.grading_scale_levels
  add constraint grading_scale_levels_sort_order_unique
  unique (grading_scale_id,institution_id,sort_order);

create or replace function private.guard_academic_year_grading_scale_change()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.grading_scale_id is distinct from old.grading_scale_id then
    if old.status='closed' then
      raise exception 'A closed academic year cannot change its grading scale' using errcode='23514';
    end if;
    if exists (
      select 1
      from public.grading_periods gp
      join public.report_card_workflows w
        on w.grading_period_id=gp.id and w.institution_id=gp.institution_id
      where gp.academic_year_id=old.id and gp.institution_id=old.institution_id
        and w.status='published'
    ) then
      raise exception 'The grading scale cannot change after a report card has been published' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;

create trigger academic_years_guard_grading_scale_change
before update of grading_scale_id on public.academic_years
for each row execute function private.guard_academic_year_grading_scale_change();

create or replace function private.create_grading_scale_impl(
  p_name text,p_description text,p_display_mode text,
  p_minimum_value numeric,p_maximum_value numeric,p_passing_value numeric,p_levels jsonb
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_id uuid;
  v_institution_id uuid;
  v_scale_id uuid;
  v_level jsonb;
  v_min numeric;
  v_max numeric;
  v_grade numeric;
  v_label text;
  v_is_passing boolean;
  v_order integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 80
    or (p_description is not null and length(p_description)>500)
    or p_display_mode not in ('numeric','descriptive','both')
    or p_minimum_value is null or p_maximum_value is null or p_maximum_value<=p_minimum_value
    or (p_passing_value is not null and (p_passing_value<p_minimum_value or p_passing_value>p_maximum_value))
    or jsonb_typeof(p_levels) is distinct from 'array'
    or jsonb_array_length(p_levels) not between 2 and 20 then
    raise exception 'Invalid grading scale configuration' using errcode='22023';
  end if;

  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  where m.user_id=v_user_id and m.status='active'
    and private.has_institution_permission(m.institution_id,'institution.manage')
  limit 1;
  if v_membership_id is null then
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

  select min((value->>'minimum_percentage')::numeric),max((value->>'maximum_percentage')::numeric)
    into v_min,v_max from jsonb_array_elements(p_levels);
  if v_min<>0 or v_max<>100 then
    raise exception 'Grading scale levels must cover the complete 0 to 100 percentage range' using errcode='23514';
  end if;

  insert into public.grading_scales(
    institution_id,name,description,display_mode,minimum_value,maximum_value,passing_value
  ) values (
    v_institution_id,btrim(p_name),nullif(btrim(p_description),''),p_display_mode,
    p_minimum_value,p_maximum_value,p_passing_value
  ) returning id into v_scale_id;

  for v_level in
    select value from jsonb_array_elements(p_levels) with ordinality as levels(value,ord) order by ord
  loop
    v_order:=v_order+1;
    v_label:=btrim(coalesce(v_level->>'label',''));
    v_min:=(v_level->>'minimum_percentage')::numeric;
    v_max:=(v_level->>'maximum_percentage')::numeric;
    v_grade:=nullif(v_level->>'grade_value','')::numeric;
    v_is_passing:=coalesce((v_level->>'is_passing')::boolean,false);
    if length(v_label) not between 1 and 80 or v_min<0 or v_max>100 or v_max<v_min
      or (p_display_mode in ('numeric','both') and v_grade is null)
      or (v_grade is not null and (v_grade<p_minimum_value or v_grade>p_maximum_value)) then
      raise exception 'Invalid grading scale level' using errcode='22023';
    end if;
    insert into public.grading_scale_levels(
      institution_id,grading_scale_id,minimum_percentage,maximum_percentage,label,grade_value,is_passing,sort_order
    ) values (
      v_institution_id,v_scale_id,v_min,v_max,v_label,v_grade,v_is_passing,v_order
    );
  end loop;
  return v_scale_id;
end;
$function$;

create or replace function private.assign_grading_scale_to_year_impl(
  p_academic_year_id uuid,p_grading_scale_id uuid
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_institution_id uuid;
  v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select ay.institution_id,ay.status into v_institution_id,v_status
  from public.academic_years ay where ay.id=p_academic_year_id for update;
  if v_institution_id is null then raise exception 'Academic year not found' using errcode='P0002'; end if;
  if not private.has_institution_permission(v_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if v_status='closed' then raise exception 'A closed academic year cannot change its grading scale' using errcode='23514'; end if;
  if not exists (select 1 from public.grading_scales gs
    where gs.id=p_grading_scale_id and gs.institution_id=v_institution_id) then
    raise exception 'Grading scale does not belong to this institution' using errcode='23503';
  end if;
  update public.academic_years set grading_scale_id=p_grading_scale_id
  where id=p_academic_year_id and institution_id=v_institution_id;
  return p_academic_year_id;
end;
$function$;

revoke all on function private.create_grading_scale_impl(text,text,text,numeric,numeric,numeric,jsonb) from public,anon;
revoke all on function private.assign_grading_scale_to_year_impl(uuid,uuid) from public,anon;
grant execute on function private.create_grading_scale_impl(text,text,text,numeric,numeric,numeric,jsonb) to authenticated;
grant execute on function private.assign_grading_scale_to_year_impl(uuid,uuid) to authenticated;

create or replace function public.create_grading_scale(
  p_name text,p_description text,p_display_mode text,
  p_minimum_value numeric,p_maximum_value numeric,p_passing_value numeric,p_levels jsonb
)
returns uuid language sql security invoker set search_path=''
as $function$
  select private.create_grading_scale_impl(p_name,p_description,p_display_mode,
    p_minimum_value,p_maximum_value,p_passing_value,p_levels);
$function$;

create or replace function public.assign_grading_scale_to_year(p_academic_year_id uuid,p_grading_scale_id uuid)
returns uuid language sql security invoker set search_path=''
as $function$
  select private.assign_grading_scale_to_year_impl(p_academic_year_id,p_grading_scale_id);
$function$;

revoke all on function public.create_grading_scale(text,text,text,numeric,numeric,numeric,jsonb) from public,anon;
revoke all on function public.assign_grading_scale_to_year(uuid,uuid) from public,anon;
grant execute on function public.create_grading_scale(text,text,text,numeric,numeric,numeric,jsonb) to authenticated;
grant execute on function public.assign_grading_scale_to_year(uuid,uuid) to authenticated;

revoke all on table public.grading_scales from public,anon,authenticated;
revoke all on table public.grading_scale_levels from public,anon,authenticated;
grant select on table public.grading_scales to authenticated;
grant select on table public.grading_scale_levels to authenticated;
