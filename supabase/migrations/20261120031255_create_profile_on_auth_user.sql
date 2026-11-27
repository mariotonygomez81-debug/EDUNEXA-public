-- Creates the profile bootstrap trigger for a Supabase installation.
-- Creates a profile row for every Auth user without granting profile privileges
-- or deriving any authorization data from user-editable metadata.

create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text;
  v_last_name text;
  v_display_name text;
begin
  v_first_name := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'first_name'), '');
  v_last_name := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'last_name'), '');
  v_display_name := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), '');

  insert into public.profiles (id, first_name, last_name, display_name)
  values (
    new.id,
    v_first_name,
    v_last_name,
    coalesce(v_display_name, nullif(pg_catalog.concat_ws(' ', v_first_name, v_last_name), ''))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user_profile() from public;
revoke all on function private.handle_new_user_profile() from anon;
revoke all on function private.handle_new_user_profile() from authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function private.handle_new_user_profile();
