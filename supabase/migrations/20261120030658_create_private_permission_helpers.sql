create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.has_institution_permission(
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.institution_id = m.institution_id
    join public.role_permissions rp
      on rp.role_id = mr.role_id
    join public.permissions p
      on p.id = rp.permission_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and p.key = p_permission_key
  );
$function$;

revoke all on function private.has_institution_permission(uuid, text) from public;
revoke all on function private.has_institution_permission(uuid, text) from anon;
grant execute on function private.has_institution_permission(uuid, text) to authenticated;

comment on function private.has_institution_permission(uuid, text)
is 'Checks an active membership role permission within one institution. Uses auth.uid() and returns only a boolean.';
