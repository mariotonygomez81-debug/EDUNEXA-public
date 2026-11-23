create unique index if not exists education_levels_institution_name_unique
  on public.education_levels(institution_id,lower(name));
create unique index if not exists education_levels_institution_code_unique
  on public.education_levels(institution_id,upper(code))
  where code is not null;
create unique index if not exists campuses_institution_name_unique
  on public.campuses(institution_id,lower(name));
create unique index if not exists campuses_institution_code_unique
  on public.campuses(institution_id,upper(code))
  where code is not null;

create or replace function private.create_education_level_impl(
  p_institution_id uuid,p_name text,p_code text,p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid; v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  v_code:=nullif(upper(btrim(p_code)),'');
  if p_name is null or length(btrim(p_name)) not between 2 and 80
    or p_sort_order is null or p_sort_order not between 1 and 1000
    or (v_code is not null and v_code !~ '^[A-Z0-9_-]{2,20}$') then
    raise exception 'Invalid education level data' using errcode='22023';
  end if;
  if exists(select 1 from public.education_levels el
    where el.institution_id=p_institution_id and lower(el.name)=lower(btrim(p_name))) then
    raise exception 'Education level already exists' using errcode='23505';
  end if;
  if v_code is not null and exists(select 1 from public.education_levels el
    where el.institution_id=p_institution_id and upper(el.code)=v_code) then
    raise exception 'Education level code already exists' using errcode='23505';
  end if;
  insert into public.education_levels(institution_id,name,code,sort_order)
  values(p_institution_id,btrim(p_name),v_code,p_sort_order)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function private.create_campus_impl(
  p_institution_id uuid,p_name text,p_code text,p_address text,p_phone text,p_is_main boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid; v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  v_code:=nullif(upper(btrim(p_code)),'');
  if p_name is null or length(btrim(p_name)) not between 2 and 100
    or (v_code is not null and v_code !~ '^[A-Z0-9_-]{2,20}$')
    or length(coalesce(p_address,''))>250
    or length(coalesce(p_phone,''))>40 then
    raise exception 'Invalid campus data' using errcode='22023';
  end if;
  if exists(select 1 from public.campuses cp
    where cp.institution_id=p_institution_id and lower(cp.name)=lower(btrim(p_name))) then
    raise exception 'Campus already exists' using errcode='23505';
  end if;
  if v_code is not null and exists(select 1 from public.campuses cp
    where cp.institution_id=p_institution_id and upper(cp.code)=v_code) then
    raise exception 'Campus code already exists' using errcode='23505';
  end if;
  if coalesce(p_is_main,false) then
    update public.campuses set is_main=false where institution_id=p_institution_id;
  end if;
  insert into public.campuses(institution_id,name,code,address,phone,is_main)
  values(p_institution_id,btrim(p_name),v_code,nullif(btrim(p_address),''),nullif(btrim(p_phone),''),coalesce(p_is_main,false))
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.create_education_level(
  p_institution_id uuid,p_name text,p_code text default null,p_sort_order integer default 1
)
returns uuid
language sql
security invoker
set search_path=''
as $function$
  select private.create_education_level_impl(p_institution_id,p_name,p_code,p_sort_order);
$function$;

create or replace function public.create_campus(
  p_institution_id uuid,p_name text,p_code text default null,
  p_address text default null,p_phone text default null,p_is_main boolean default false
)
returns uuid
language sql
security invoker
set search_path=''
as $function$
  select private.create_campus_impl(p_institution_id,p_name,p_code,p_address,p_phone,p_is_main);
$function$;

revoke all on function private.create_education_level_impl(uuid,text,text,integer) from public,anon;
grant execute on function private.create_education_level_impl(uuid,text,text,integer) to authenticated;
revoke all on function private.create_campus_impl(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function private.create_campus_impl(uuid,text,text,text,text,boolean) to authenticated;
revoke all on function public.create_education_level(uuid,text,text,integer) from public,anon;
grant execute on function public.create_education_level(uuid,text,text,integer) to authenticated;
revoke all on function public.create_campus(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.create_campus(uuid,text,text,text,text,boolean) to authenticated;

revoke insert,update,delete on table public.education_levels,public.campuses from public,anon,authenticated;
grant select on table public.education_levels,public.campuses to authenticated;
