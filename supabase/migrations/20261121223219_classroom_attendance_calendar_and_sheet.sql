-- Asistencia áulica: calendario mensual, planilla diaria y guardado seguro.
alter table public.classroom_attendance_records
  drop constraint if exists classroom_attendance_records_status_check;
alter table public.classroom_attendance_records
  add constraint classroom_attendance_records_status_check
  check (status = any (array['present','absent','half_absence']::text[]));

create unique index if not exists classroom_attendance_one_session_per_day
  on public.classroom_attendance_sessions (classroom_id, held_on);

create or replace function private.list_classroom_attendance_month_impl(p_classroom_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_institution_id uuid; v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Autenticación requerida'; end if;
  select institution_id into v_institution_id from public.virtual_classrooms where id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'No tenés permiso para consultar la asistencia de esta aula';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'held_on',s.held_on,'status',s.status,
    'present_count',coalesce(a.present_count,0),'absent_count',coalesce(a.absent_count,0),
    'half_absence_count',coalesce(a.half_absence_count,0),'record_count',coalesce(a.record_count,0)) order by s.held_on),'[]'::jsonb)
  into v_result
  from public.classroom_attendance_sessions s
  left join lateral (select count(*) filter(where r.status='present') present_count,
    count(*) filter(where r.status='absent') absent_count,
    count(*) filter(where r.status='half_absence') half_absence_count,count(*) record_count
    from public.classroom_attendance_records r where r.session_id=s.id) a on true
  where s.classroom_id=p_classroom_id and s.held_on>=date_trunc('month',p_month)::date
    and s.held_on<(date_trunc('month',p_month)+interval '1 month')::date;
  return v_result;
end; $$;

create or replace function public.list_classroom_attendance_month(p_classroom_id uuid,p_month date)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.list_classroom_attendance_month_impl(p_classroom_id,p_month); $$;

create or replace function private.get_classroom_attendance_sheet_impl(p_classroom_id uuid,p_held_on date)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_institution_id uuid; v_division_id uuid; v_session_id uuid; v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Autenticación requerida'; end if;
  select institution_id,division_id into v_institution_id,v_division_id from public.virtual_classrooms where id=p_classroom_id;
  if v_institution_id is null or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.manage') then
    raise exception 'No tenés permiso para tomar asistencia en esta aula';
  end if;
  insert into public.classroom_attendance_sessions(institution_id,classroom_id,division_id,held_on,created_by)
  values(v_institution_id,p_classroom_id,v_division_id,p_held_on,(select auth.uid()))
  on conflict(classroom_id,held_on) do nothing;
  select id into v_session_id from public.classroom_attendance_sessions where classroom_id=p_classroom_id and held_on=p_held_on;
  select jsonb_build_object('session_id',v_session_id,'held_on',p_held_on,'students',coalesce((
    select jsonb_agg(jsonb_build_object('student_id',st.id,'student_number',st.student_number,
      'name',concat_ws(' ',st.last_name,st.first_name),'status',r.status,'observation',r.note)
      order by st.last_name,st.first_name)
    from public.enrollments e join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
    left join public.classroom_attendance_records r on r.session_id=v_session_id and r.student_id=st.id
    where e.institution_id=v_institution_id and e.division_id=v_division_id and e.status='active'
      and e.enrolled_on<=p_held_on and (e.ended_on is null or e.ended_on>=p_held_on) and st.status='active'
  ),'[]'::jsonb)) into v_result;
  return v_result;
end; $$;

create or replace function public.get_classroom_attendance_sheet(p_classroom_id uuid,p_held_on date)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.get_classroom_attendance_sheet_impl(p_classroom_id,p_held_on); $$;

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

create or replace function public.save_classroom_attendance_sheet(p_classroom_id uuid,p_session_id uuid,p_records jsonb)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.save_classroom_attendance_sheet_impl(p_classroom_id,p_session_id,p_records); $$;

revoke all on function public.list_classroom_attendance_month(uuid,date) from public,anon;
revoke all on function public.get_classroom_attendance_sheet(uuid,date) from public,anon;
revoke all on function public.save_classroom_attendance_sheet(uuid,uuid,jsonb) from public,anon;
grant execute on function public.list_classroom_attendance_month(uuid,date) to authenticated;
grant execute on function public.get_classroom_attendance_sheet(uuid,date) to authenticated;
grant execute on function public.save_classroom_attendance_sheet(uuid,uuid,jsonb) to authenticated;
