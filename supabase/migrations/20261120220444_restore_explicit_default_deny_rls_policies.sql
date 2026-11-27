do $explicit_deny$
declare
  table_row record;
begin
  for table_row in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname='public' and p.tablename=c.relname
      )
  loop
    execute format(
      'create policy client_access_denied on public.%I for all to anon, authenticated using (false) with check (false)',
      table_row.relname
    );
  end loop;
end
$explicit_deny$;
