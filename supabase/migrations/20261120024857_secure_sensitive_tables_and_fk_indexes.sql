
do $$
declare t text;
begin
 foreach t in array array[
 'staff_assignments','students','guardians','student_guardians','enrollments',
 'attendance_sessions','attendance_records','assessments','grade_records',
 'classroom_members','classroom_materials','assignments','submissions',
 'conversations','conversation_members','messages','audit_logs','subscriptions'
 ] loop
  execute format('drop policy if exists %I on public.%I', t || '_deny_client_access', t);
  execute format('create policy %I on public.%I for all to authenticated using (false) with check (false)', t || '_deny_client_access', t);
 end loop;
 drop policy if exists subscription_plans_authenticated_read on public.subscription_plans;
 create policy subscription_plans_authenticated_read on public.subscription_plans
   for select to authenticated using (is_active = true);
 drop policy if exists public_site_pages_deny_client_access on public.public_site_pages;
 create policy public_site_pages_deny_client_access on public.public_site_pages
   for all to authenticated using (false) with check (false);
end $$;

do $$
declare
 c record;
 cols text;
 idx text;
begin
 for c in
  select conrelid::regclass as tbl, conname, conkey
  from pg_constraint
  where contype='f' and connamespace='public'::regnamespace
 loop
  select string_agg(quote_ident(a.attname), ',' order by u.ord)
    into cols
  from unnest(c.conkey) with ordinality u(attnum,ord)
  join pg_attribute a on a.attrelid=c.tbl and a.attnum=u.attnum;
  idx := left('ix_' || replace(c.tbl::text,'.','_') || '_' || regexp_replace(c.conname,'[^a-zA-Z0-9_]','','g'), 60);
  execute format('create index if not exists %I on %s (%s)', idx, c.tbl, cols);
 end loop;
end $$;
