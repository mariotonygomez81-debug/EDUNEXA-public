do $$
declare v_def text;
begin
  select pg_get_functiondef('private.list_classroom_people_impl(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    'from public.staff_assignments sa
      where not exists',
    'from public.staff_assignments sa
      where sa.assignment_type = ''teacher''
        and not exists');
  execute v_def;
end $$;
