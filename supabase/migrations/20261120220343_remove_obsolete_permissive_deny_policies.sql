do $cleanup$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public'
      and policyname ilike '%deny_client%'
      and qual='false'
      and (with_check is null or with_check='false')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,policy_row.schemaname,policy_row.tablename
    );
  end loop;
end
$cleanup$;

-- Direct DML on grading scales is revoked; scoped member-read policies remain.
drop policy if exists grading_scales_manage on public.grading_scales;
drop policy if exists grading_scale_levels_manage on public.grading_scale_levels;
