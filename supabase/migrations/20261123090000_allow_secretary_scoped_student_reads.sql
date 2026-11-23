-- Secretaría has explicit student read/manage permissions, so the shared
-- student-scope helper must recognize that role for RLS-protected reads.
do $migration$
declare
  v_definition text;
  v_old text := $$r.key in ('institution_admin', 'administrative', 'director')$$;
  v_new text := $$r.key in ('institution_admin', 'administrative', 'director', 'secretary')$$;
begin
  select pg_get_functiondef('private.can_access_student(uuid,uuid,text)'::regprocedure)
    into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected student-role authorization clause was not found; migration stopped';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$migration$;
