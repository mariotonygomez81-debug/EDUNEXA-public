do $$
declare v_def text;
begin
  select pg_get_functiondef('private.get_classroom_capabilities_impl(uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,'v_materials boolean; v_assignments boolean; v_attendance boolean;',
    'v_materials boolean; v_assignments boolean; v_attendance boolean; v_manage_members boolean;');
  v_def:=replace(v_def,
    '  return jsonb_build_object(',
    '  select exists(select 1 from public.virtual_classrooms vc join public.memberships m on m.institution_id=vc.institution_id and m.user_id=(select auth.uid()) and m.status=''active'' where vc.id=p_classroom_id and (vc.owner_membership_id=m.id or vc.created_by=m.user_id)) into v_manage_members;' || E'\n' ||
    '  return jsonb_build_object(');
  v_def:=replace(v_def,'''can_manage_members'',v_manage','''can_manage_members'',v_manage_members');
  execute v_def;
end $$;
