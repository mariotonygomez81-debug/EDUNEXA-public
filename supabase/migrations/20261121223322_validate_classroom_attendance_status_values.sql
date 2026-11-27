-- Refuerza el rechazo de estados nulos al guardar planillas de asistencia.
create or replace function private.save_classroom_attendance_sheet_impl(p_classroom_id uuid,p_session_id uuid,p_records jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_institution_id uuid; v_held_on date; v_expected integer; v_received integer; v_invalid integer;
begin
  if (select auth.uid()) is null then raise exception 'Autenticación requerida'; end if;
  select vc.institution_id into v_institution_id from public.classroom_attendance_sessions s
    join public.virtual_classrooms vc on vc.id=s.classroom_id and vc.institution_id=s.institution_id
    where s.id=p_session_id and s.classroom_id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'No tenés permiso para guardar esta planilla';
  end if;
  select held_on into v_held_on from public.classroom_attendance_sessions where id=p_session_id;
  if jsonb_typeof(p_records)<>'array' then raise exception 'La planilla no tiene un formato válido'; end if;
  select count(*) into v_expected from public.enrollments e
    join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
    join public.classroom_attendance_sessions s on s.id=p_session_id
    where e.institution_id=v_institution_id and e.division_id=s.division_id and e.status='active'
      and e.enrolled_on<=v_held_on and (e.ended_on is null or e.ended_on>=v_held_on) and st.status='active';
  select count(*),count(*) filter(where x.student_id is null or x.status is null
    or x.status not in ('present','absent','half_absence') or length(coalesce(x.observation,''))>1000)
    into v_received,v_invalid from jsonb_to_recordset(p_records) as x(student_id uuid,status text,observation text);
  if v_invalid>0 or v_received<>v_expected then raise exception 'Completá el estado y las observaciones válidas de todos los alumnos'; end if;
  if exists(select 1 from jsonb_to_recordset(p_records) as x(student_id uuid,status text,observation text)
    group by x.student_id having count(*)>1) then raise exception 'Hay alumnos repetidos en la planilla'; end if;
  if exists(select 1 from jsonb_to_recordset(p_records) as x(student_id uuid,status text,observation text)
    where not exists(select 1 from public.enrollments e join public.classroom_attendance_sessions s on s.id=p_session_id
      where e.student_id=x.student_id and e.institution_id=v_institution_id and e.division_id=s.division_id
      and e.status='active' and e.enrolled_on<=v_held_on and (e.ended_on is null or e.ended_on>=v_held_on)))
    then raise exception 'La planilla contiene un alumno ajeno a esta división'; end if;
  insert into public.classroom_attendance_records(session_id,institution_id,student_id,status,note,recorded_by,recorded_at,updated_at)
    select p_session_id,v_institution_id,x.student_id,x.status,nullif(btrim(x.observation),''),(select auth.uid()),now(),now()
    from jsonb_to_recordset(p_records) as x(student_id uuid,status text,observation text)
    on conflict(session_id,student_id) do update set status=excluded.status,note=excluded.note,
      recorded_by=excluded.recorded_by,updated_at=now();
  update public.classroom_attendance_sessions set status='submitted',updated_at=now() where id=p_session_id;
  return jsonb_build_object('saved',true,'count',v_received,'held_on',v_held_on);
end; $$;