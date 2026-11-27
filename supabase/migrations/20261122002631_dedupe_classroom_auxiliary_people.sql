do $$
declare v_def text;
begin
  select pg_get_functiondef('private.list_classroom_people_impl(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    'from public.staff_assignments sa
      union all',
    'from public.staff_assignments sa
      where not exists (
        select 1 from public.classroom_teacher_permissions active_ctp
        where active_ctp.classroom_id=p_classroom_id
          and active_ctp.teacher_membership_id=sa.membership_id
          and active_ctp.is_active
      )
      union all');
  execute v_def;
end $$;
