do $$
declare v_def text;
begin
  select pg_get_functiondef('private.create_teacher_guardian_appointment_impl(uuid,uuid,timestamp with time zone,text)'::regprocedure) into v_def;
  v_def:=replace(v_def,$old$p_scheduled_at < now()-interval '1 day'$old$,$new$p_scheduled_at <= now()$new$);
  execute v_def;
end $$;
