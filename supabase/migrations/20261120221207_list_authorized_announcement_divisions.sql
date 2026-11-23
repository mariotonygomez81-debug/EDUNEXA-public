create or replace function private.list_announcement_divisions_impl(p_institution_id uuid)
returns table(id uuid,name text,course_name text)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_is_admin boolean;
  v_is_director boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;
  if v_membership_id is null
    or not private.has_institution_permission(p_institution_id,'communications.manage') then
    raise exception 'Announcement management permission required' using errcode='42501';
  end if;

  select
    coalesce(bool_or(r.key='institution_admin'),false),
    coalesce(bool_or(r.key='director'),false)
  into v_is_admin,v_is_director
  from public.membership_roles mr
  join public.roles r on r.id=mr.role_id
  where mr.membership_id=v_membership_id
    and mr.institution_id=p_institution_id;

  return query
  select d.id,d.name,c.name
  from public.divisions d
  join public.courses c
    on c.id=d.course_id and c.institution_id=d.institution_id
  where d.institution_id=p_institution_id
    and (
      v_is_admin or v_is_director
      or private.can_manage_division(d.id,p_institution_id,'communications.manage')
    )
  order by c.name,d.name;
end;
$function$;

revoke all on function private.list_announcement_divisions_impl(uuid) from public,anon;
grant execute on function private.list_announcement_divisions_impl(uuid) to authenticated;

create or replace function public.list_announcement_divisions(p_institution_id uuid)
returns table(id uuid,name text,course_name text)
language sql
stable
security invoker
set search_path=''
as $function$
  select * from private.list_announcement_divisions_impl(p_institution_id);
$function$;

revoke all on function public.list_announcement_divisions(uuid) from public,anon;
grant execute on function public.list_announcement_divisions(uuid) to authenticated;
