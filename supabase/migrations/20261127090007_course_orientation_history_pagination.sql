-- Paginated, filterable access to the complete immutable course orientation history.
create index if not exists course_orientation_history_course_timeline_idx
 on public.course_orientation_history (institution_id, course_id, changed_at desc, id desc);

create or replace function public.list_course_orientation_history_page(
 p_institution_id uuid,
 p_course_id uuid,
 p_page integer default 1,
 p_page_size integer default 25,
 p_from_date date default null,
 p_to_date date default null,
 p_actor_name text default null
) returns table(
 course_id uuid,
 course_name text,
 history_id bigint,
 previous_orientation_name text,
 new_orientation_name text,
 actor_user_id uuid,
 actor_name text,
 changed_at timestamptz,
 total_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
 v_offset bigint;
begin
 if (select auth.uid()) is null then
  raise exception 'Authentication required' using errcode='28000';
 end if;

 if not private.has_institution_permission(p_institution_id,'institution.manage') then
  raise exception 'Institution administration permission required' using errcode='42501';
 end if;

 if p_page is null or p_page<1 or p_page>100000
    or p_page_size is null or p_page_size<10 or p_page_size>100 then
  raise exception 'Invalid history pagination' using errcode='22023';
 end if;
 if p_from_date is not null and p_to_date is not null and p_from_date>p_to_date then
  raise exception 'Invalid history date range' using errcode='22023';
 end if;

 if not exists (
  select 1 from public.courses c
  where c.id=p_course_id and c.institution_id=p_institution_id
 ) then
  raise exception 'Course not found in institution' using errcode='P0002';
 end if;

 v_offset := (p_page::bigint-1)*p_page_size;

 return query
 with filtered as (
  select
   h.course_id,
   c.name::text as course_name,
   h.id as history_id,
   h.previous_orientation_name::text,
   h.new_orientation_name::text,
   m.user_id as actor_user_id,
   coalesce(
    nullif(u.raw_user_meta_data->>'full_name',''),
    nullif(u.raw_user_meta_data->>'name',''),
    u.email,
    'Usuario'
   )::text as actor_name,
   h.changed_at,
   count(*) over() as total_count
  from public.course_orientation_history h
  join public.courses c
   on c.id=h.course_id and c.institution_id=h.institution_id
  join public.memberships m
   on m.id=h.actor_membership_id and m.institution_id=h.institution_id
  left join auth.users u on u.id=m.user_id
  where h.institution_id=p_institution_id
   and h.course_id=p_course_id
   and (p_from_date is null or h.changed_at >= (p_from_date::timestamp at time zone 'America/Argentina/Buenos_Aires'))
   and (p_to_date is null or h.changed_at < ((p_to_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
   and (
    nullif(trim(p_actor_name),'') is null
    or coalesce(
     nullif(u.raw_user_meta_data->>'full_name',''),
     nullif(u.raw_user_meta_data->>'name',''),
     u.email,
     'Usuario'
    ) ilike '%'||trim(p_actor_name)||'%'
   )
 )
 select f.course_id,f.course_name,f.history_id,
  f.previous_orientation_name,f.new_orientation_name,
  f.actor_user_id,f.actor_name,f.changed_at,f.total_count
 from filtered f
 order by f.changed_at desc,f.history_id desc
 limit p_page_size offset v_offset;
end;
$function$;

revoke all on function public.list_course_orientation_history_page(uuid,uuid,integer,integer,date,date,text) from public,anon;
grant execute on function public.list_course_orientation_history_page(uuid,uuid,integer,integer,date,date,text) to authenticated;
