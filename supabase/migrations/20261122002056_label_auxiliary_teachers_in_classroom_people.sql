do $$
declare v_def text;
begin
  select pg_get_functiondef('private.list_classroom_people_impl(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    '''assignment'', sa.assignment_type',
    '''assignment'', case when coalesce(ctp.is_active,false) then ''assistant'' else sa.assignment_type end');
  v_def:=replace(v_def,
    'join public.profiles p on p.id=m.user_id',
    'join public.profiles p on p.id=m.user_id
      left join public.classroom_teacher_permissions ctp
        on ctp.classroom_id=p_classroom_id and ctp.teacher_membership_id=m.id');
  execute v_def;
end $$;
