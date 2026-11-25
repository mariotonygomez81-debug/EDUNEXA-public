-- Tighten the teacher calendar filter and keep the new read RPC invoker-facing.
do $$
declare d text;
begin
 select pg_get_functiondef('private.list_classroom_attendance_month_impl(uuid,date)'::regprocedure) into d;
 d:=replace(d,
  'where s.classroom_id=p_classroom_id' || chr(10) || '    and s.held_on >=',
  'where s.classroom_id=p_classroom_id' || chr(10) || '    and (s.created_by=(select auth.uid()) or private.can_supervise_attendance(s.institution_id))' || chr(10) || '    and s.held_on >=');
 if position('s.created_by=(select auth.uid())' in d)=0 then
  raise exception 'Could not scope classroom attendance calendar by owner';
 end if;
 execute d;

 select pg_get_functiondef('private.get_classroom_attendance_sheet_impl(uuid,date)'::regprocedure) into d;
 d:=replace(d,
  '''session_id'',v_session_id,''held_on'',p_held_on,',
  '''session_id'',v_session_id,''held_on'',p_held_on,''created_by'',(select auth.uid()),');
 execute d;
end $$;

create or replace function private.get_classroom_attendance_session_impl(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare s public.classroom_attendance_sessions%rowtype; result jsonb;
begin
 if (select auth.uid()) is null then raise exception 'Autenticación requerida'; end if;
 select * into s from public.classroom_attendance_sessions where id=p_session_id;
 if not found then raise exception 'Planilla inexistente'; end if;
 if not ((s.created_by=(select auth.uid()) and private.can_access_classroom(s.classroom_id,s.institution_id,'classroom.attendance.manage'))
  or private.can_supervise_attendance(s.institution_id)) then raise exception 'No tenés permiso para consultar esta planilla'; end if;
 select jsonb_build_object('session_id',s.id,'held_on',s.held_on,'created_by',s.created_by,
  'students',coalesce((select jsonb_agg(jsonb_build_object('student_id',st.id,'student_number',st.student_number,
   'name',concat_ws(' ',st.last_name,st.first_name),'status',r.status,'observation',r.note) order by st.last_name,st.first_name)
   from public.enrollments e join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
   left join public.classroom_attendance_records r on r.session_id=s.id and r.student_id=st.id
   where e.institution_id=s.institution_id and e.division_id=s.division_id and e.status='active'
    and e.enrolled_on<=s.held_on and (e.ended_on is null or e.ended_on>=s.held_on) and st.status='active'),'[]'::jsonb))
 into result;
 return result;
end $$;
revoke all on function private.get_classroom_attendance_session_impl(uuid) from public,anon;
grant execute on function private.get_classroom_attendance_session_impl(uuid) to authenticated;

create or replace function public.get_classroom_attendance_sheet_by_session(p_session_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.get_classroom_attendance_session_impl(p_session_id); $$;
revoke all on function public.get_classroom_attendance_sheet_by_session(uuid) from public,anon;
grant execute on function public.get_classroom_attendance_sheet_by_session(uuid) to authenticated;