-- Assertions run as authenticated users against synthetic fixture data.
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);

do $test$
declare
  v_count integer;
  v_row record;
  v_result text;
begin
  select count(*) into v_count
  from public.list_my_child_assignment_progress(
    '30000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001'
  );
  if v_count <> 2 then
    raise exception 'Expected two published assignments for linked child; got %', v_count;
  end if;

  select * into v_row
  from public.list_my_child_assignment_progress(
    '30000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001'
  )
  where assignment_title = 'Ecuaciones';
  if v_row.score <> 8 or v_row.max_score <> 10 or not v_row.can_view_grade then
    raise exception 'Grade visibility for authorized guardian is incorrect';
  end if;
  if v_row.review_status <> 'aprobado' or not v_row.submitted then
    raise exception 'Submission/review status was not returned correctly';
  end if;

  begin
    perform * from public.list_my_child_assignment_progress(
      '30000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000002'
    );
    raise exception 'Guardian unexpectedly accessed an unlinked child';
  exception when insufficient_privilege then
    null;
  end;

  select count(*) into v_count
  from public.list_my_child_assignment_progress(
    '30000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000003'
  );
  if v_count <> 0 then
    raise exception 'Withdrawn enrollment unexpectedly returned assignments';
  end if;

  begin
    perform * from public.list_my_child_assignment_progress(
      '30000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000003'
    );
    raise exception 'Inactive guardian unexpectedly accessed a child';
  exception when insufficient_privilege then
    null;
  end;

  select pg_get_function_result(
    'public.list_my_child_assignment_progress(uuid,uuid)'::regprocedure
  ) into v_result;
  if v_result ilike '%body%' or v_result ilike '%feedback%' or v_result ilike '%file_path%' then
    raise exception 'Private submission content leaked in RPC result definition: %', v_result;
  end if;
end
$test$;

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',false);
do $test$
declare
  v_row record;
begin
  select * into v_row
  from public.list_my_child_assignment_progress(
    '30000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000002'
  )
  where assignment_title = 'Ecuaciones';
  if not found then
    raise exception 'Guardian with restricted grade permission did not receive task progress';
  end if;
  if v_row.score is not null or v_row.max_score is not null or v_row.can_view_grade then
    raise exception 'Restricted guardian received grade data';
  end if;
end
$test$;

reset role;
select 'Guardian assignment progress PostgreSQL checks passed.' as result;
