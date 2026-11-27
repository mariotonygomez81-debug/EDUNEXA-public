do $migration$
declare
  v_definition text;
  v_old text := $$ (r.key='institution_admin' and p_permission_key in ('classroom.read','classroom.manage','classroom.grade')) $$;
  v_new text := $$ (r.key='institution_admin' and p_permission_key='classroom.read') $$;
begin
  select pg_get_functiondef('private.can_access_classroom(uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_old := trim(v_old);
  v_new := trim(v_new);
  if position(v_old in v_definition)=0 then
    raise exception 'Expected institution_admin classroom permission rule was not found; migration stopped';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$migration$;