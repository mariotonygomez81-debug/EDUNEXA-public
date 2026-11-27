do $migration$
declare
  v_definition text;
  v_old_decl text := $old$v_materials boolean; v_assignments boolean; v_attendance boolean; v_manage_members boolean;$old$;
  v_new_decl text := $new$v_materials boolean; v_assignments boolean; v_attendance boolean; v_view_attendance boolean; v_manage_members boolean;$new$;
  v_old_attendance text := $old$v_attendance:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.attendance.manage');$old$;
  v_new_attendance text := $new$v_attendance:=private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.attendance.manage');
  v_view_attendance:=private.can_view_classroom_attendance(p_classroom_id,v_institution_id);$new$;
  v_old_return text := $old$'can_manage_members',v_manage_members);$old$;
  v_new_return text := $new$'can_manage_members',v_manage_members,'can_view_attendance',v_view_attendance);$new$;
begin
  select pg_get_functiondef('private.get_classroom_capabilities_impl(uuid)'::regprocedure)
    into v_definition;
  if position(v_old_decl in v_definition)=0 or position(v_old_attendance in v_definition)=0 or position(v_old_return in v_definition)=0 then
    raise exception 'Could not locate classroom capability fields to extend';
  end if;
  v_definition:=replace(v_definition,v_old_decl,v_new_decl);
  v_definition:=replace(v_definition,v_old_attendance,v_new_attendance);
  v_definition:=replace(v_definition,v_old_return,v_new_return);
  execute v_definition;
end
$migration$;