drop function if exists public.mark_notification_read(uuid);
drop function if exists private.mark_notification_read_impl(uuid);
drop function if exists public.set_notification_preference(text,boolean);
drop function if exists private.set_notification_preference_impl(text,boolean);

create or replace function private.mark_notification_read_impl(
  p_notification_id uuid,
  p_institution_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_count integer;
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
  if v_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;
  update public.notifications
  set read_at=coalesce(read_at,now())
  where id=p_notification_id
    and recipient_membership_id=v_membership_id
    and institution_id=p_institution_id;
  get diagnostics v_count=row_count;
  return v_count=1;
end;
$function$;

revoke all on function private.mark_notification_read_impl(uuid,uuid) from public,anon;
grant execute on function private.mark_notification_read_impl(uuid,uuid) to authenticated;

create or replace function public.mark_notification_read(
  p_notification_id uuid,
  p_institution_id uuid
)
returns boolean
language sql
security invoker
set search_path=''
as $function$
  select private.mark_notification_read_impl(p_notification_id,p_institution_id);
$function$;

revoke all on function public.mark_notification_read(uuid,uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid,uuid) to authenticated;

create or replace function private.set_notification_preference_impl(
  p_institution_id uuid,
  p_notification_type text,
  p_in_app_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_institution_id is null
    or p_notification_type is null
    or p_notification_type not in ('announcement','message','grade','attendance','support')
    or p_in_app_enabled is null then
    raise exception 'Invalid notification preference' using errcode='22023';
  end if;
  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;
  if v_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;
  insert into public.notification_preferences(
    institution_id,membership_id,notification_type,in_app_enabled
  ) values (
    p_institution_id,v_membership_id,p_notification_type,p_in_app_enabled
  )
  on conflict (institution_id,membership_id,notification_type)
  do update set in_app_enabled=excluded.in_app_enabled,updated_at=now();
  return true;
end;
$function$;

revoke all on function private.set_notification_preference_impl(uuid,text,boolean) from public,anon;
grant execute on function private.set_notification_preference_impl(uuid,text,boolean) to authenticated;

create or replace function public.set_notification_preference(
  p_institution_id uuid,
  p_notification_type text,
  p_in_app_enabled boolean
)
returns boolean
language sql
security invoker
set search_path=''
as $function$
  select private.set_notification_preference_impl(
    p_institution_id,p_notification_type,p_in_app_enabled
  );
$function$;

revoke all on function public.set_notification_preference(uuid,text,boolean) from public,anon;
grant execute on function public.set_notification_preference(uuid,text,boolean) to authenticated;
