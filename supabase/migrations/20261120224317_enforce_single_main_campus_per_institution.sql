with ranked as (
  select id,
    row_number() over (partition by institution_id order by is_main desc,created_at,id) as rn
  from public.campuses
  where is_main
)
update public.campuses cp
set is_main=false
from ranked r
where cp.id=r.id and r.rn>1;

create unique index if not exists campuses_one_main_per_institution_unique
  on public.campuses(institution_id)
  where is_main;

create or replace function private.create_campus_impl(
  p_institution_id uuid,p_name text,p_code text,p_address text,p_phone text,p_is_main boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_code text;
  v_is_main boolean;
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

  v_is_main:=coalesce(p_is_main,false) or not exists(
    select 1 from public.campuses cp where cp.institution_id=p_institution_id and cp.is_main
  );
  if v_is_main then
    update public.campuses set is_main=false where institution_id=p_institution_id;
  end if;
  insert into public.campuses(institution_id,name,code,address,phone,is_main)
  values(p_institution_id,btrim(p_name),v_code,nullif(btrim(p_address),''),nullif(btrim(p_phone),''),v_is_main)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function private.create_campus_impl(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function private.create_campus_impl(uuid,text,text,text,text,boolean) to authenticated;
