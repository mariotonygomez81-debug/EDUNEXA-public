-- Independent attendance ownership for every teacher and preceptor.
create or replace function private.can_supervise_attendance(p_institution_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.memberships m
 join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.roles r on r.id=mr.role_id
 where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active'
 and r.key in ('institution_admin','administrative','director')
 and private.has_institution_permission(p_institution_id,'attendance.read')); $$;
revoke all on function private.can_supervise_attendance(uuid) from public,anon;
grant execute on function private.can_supervise_attendance(uuid) to authenticated;

-- Preceptor: duplicate date/period is allowed for different preceptors.
drop index if exists public.prefect_attendance_sessions_unique_period;
create unique index prefect_attendance_sessions_owner_period_uidx
 on public.prefect_attendance_sessions(institution_id,division_id,held_on,coalesce(period_label,''),created_by);
drop policy if exists prefect_attendance_sessions_read on public.prefect_attendance_sessions;
create policy prefect_attendance_sessions_read on public.prefect_attendance_sessions for select to authenticated
using(created_by=(select auth.uid()) or private.can_supervise_attendance(institution_id));
drop policy if exists prefect_attendance_sessions_insert on public.prefect_attendance_sessions;
create policy prefect_attendance_sessions_insert on public.prefect_attendance_sessions for insert to authenticated
with check(created_by=(select auth.uid()) and private.can_manage_division(division_id,institution_id,'attendance.manage'));
drop policy if exists prefect_attendance_sessions_update on public.prefect_attendance_sessions;
create policy prefect_attendance_sessions_update on public.prefect_attendance_sessions for update to authenticated
using(created_by=(select auth.uid()) and private.can_manage_division(division_id,institution_id,'attendance.manage'))
with check(created_by=(select auth.uid()) and private.can_manage_division(division_id,institution_id,'attendance.manage'));
drop policy if exists prefect_attendance_records_read on public.prefect_attendance_records;
create policy prefect_attendance_records_read on public.prefect_attendance_records for select to authenticated
using(exists(select 1 from public.prefect_attendance_sessions s where s.id=session_id and s.institution_id=prefect_attendance_records.institution_id
 and (s.created_by=(select auth.uid()) or private.can_supervise_attendance(s.institution_id))));
drop policy if exists prefect_attendance_records_write on public.prefect_attendance_records;
create policy prefect_attendance_records_write on public.prefect_attendance_records for all to authenticated
using(exists(select 1 from public.prefect_attendance_sessions s where s.id=session_id and s.institution_id=prefect_attendance_records.institution_id
 and s.created_by=(select auth.uid()) and s.status='open' and private.can_manage_division(s.division_id,s.institution_id,'attendance.manage')))
with check(exists(select 1 from public.prefect_attendance_sessions s where s.id=session_id and s.institution_id=prefect_attendance_records.institution_id
 and s.created_by=(select auth.uid()) and s.status='open' and private.can_manage_division(s.division_id,s.institution_id,'attendance.manage'))
 and exists(select 1 from public.enrollments e join public.prefect_attendance_sessions s on s.id=session_id and s.institution_id=prefect_attendance_records.institution_id
 where e.institution_id=prefect_attendance_records.institution_id and e.division_id=s.division_id and e.student_id=prefect_attendance_records.student_id
 and e.status='active' and e.enrolled_on<=s.held_on and (e.ended_on is null or e.ended_on>=s.held_on)));

-- Teacher: one classroom/day register per teacher.
drop index if exists public.classroom_attendance_one_session_per_day;
create unique index classroom_attendance_one_session_per_teacher_day_uidx
 on public.classroom_attendance_sessions(classroom_id,held_on,created_by);
create or replace function private.can_view_classroom_attendance(p_classroom_id uuid,p_institution_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.can_supervise_attendance(p_institution_id)
 or private.can_access_classroom(p_classroom_id,p_institution_id,'classroom.attendance.manage'); $$;
revoke all on function private.can_view_classroom_attendance(uuid,uuid) from public,anon;
grant execute on function private.can_view_classroom_attendance(uuid,uuid) to authenticated;

alter table public.classroom_attendance_sessions enable row level security;
alter table public.classroom_attendance_records enable row level security;
drop policy if exists classroom_attendance_sessions_owner_read on public.classroom_attendance_sessions;
create policy classroom_attendance_sessions_owner_read on public.classroom_attendance_sessions for select to authenticated
using(created_by=(select auth.uid()) or private.can_supervise_attendance(institution_id));
drop policy if exists classroom_attendance_sessions_owner_insert on public.classroom_attendance_sessions;
create policy classroom_attendance_sessions_owner_insert on public.classroom_attendance_sessions for insert to authenticated
with check(created_by=(select auth.uid()) and private.can_access_classroom(classroom_id,institution_id,'classroom.attendance.manage'));
drop policy if exists classroom_attendance_sessions_owner_update on public.classroom_attendance_sessions;
create policy classroom_attendance_sessions_owner_update on public.classroom_attendance_sessions for update to authenticated
using(created_by=(select auth.uid()) and private.can_access_classroom(classroom_id,institution_id,'classroom.attendance.manage'))
with check(created_by=(select auth.uid()) and private.can_access_classroom(classroom_id,institution_id,'classroom.attendance.manage'));
drop policy if exists classroom_attendance_records_owner_read on public.classroom_attendance_records;
create policy classroom_attendance_records_owner_read on public.classroom_attendance_records for select to authenticated
using(exists(select 1 from public.classroom_attendance_sessions s where s.id=session_id and s.institution_id=classroom_attendance_records.institution_id
 and (s.created_by=(select auth.uid()) or private.can_supervise_attendance(s.institution_id))));
drop policy if exists classroom_attendance_records_owner_insert on public.classroom_attendance_records;
create policy classroom_attendance_records_owner_insert on public.classroom_attendance_records for insert to authenticated
with check(recorded_by=(select auth.uid()) and exists(select 1 from public.classroom_attendance_sessions s where s.id=session_id
 and s.institution_id=classroom_attendance_records.institution_id and s.created_by=(select auth.uid()) and s.status<>'closed'
 and private.can_access_classroom(s.classroom_id,s.institution_id,'classroom.attendance.manage')));
drop policy if exists classroom_attendance_records_owner_update on public.classroom_attendance_records;
create policy classroom_attendance_records_owner_update on public.classroom_attendance_records for update to authenticated
using(exists(select 1 from public.classroom_attendance_sessions s where s.id=session_id and s.institution_id=classroom_attendance_records.institution_id
 and s.created_by=(select auth.uid()) and s.status<>'closed' and private.can_access_classroom(s.classroom_id,s.institution_id,'classroom.attendance.manage')))
with check(recorded_by=(select auth.uid()) and exists(select 1 from public.classroom_attendance_sessions s where s.id=session_id
 and s.institution_id=classroom_attendance_records.institution_id and s.created_by=(select auth.uid()) and s.status<>'closed'
 and private.can_access_classroom(s.classroom_id,s.institution_id,'classroom.attendance.manage')));

-- Owner-scoped calendar with read-only institutional oversight.
do $$
declare d text;
begin
 select pg_get_functiondef('private.list_classroom_attendance_month_impl(uuid,date)'::regprocedure) into d;
 d:=replace(d,
  'where s.classroom_id=p_classroom_id and s.held_on>=date_trunc',
  'where s.classroom_id=p_classroom_id and (s.created_by=(select auth.uid()) or private.can_supervise_attendance(s.institution_id)) and s.held_on>=date_trunc');
 d:=replace(d,
  '''id'',s.id,''held_on'',s.held_on,''status'',s.status,',
  '''id'',s.id,''held_on'',s.held_on,''status'',s.status,''created_by'',s.created_by,');
 execute d;

 select pg_get_functiondef('private.get_classroom_attendance_sheet_impl(uuid,date)'::regprocedure) into d;
 d:=replace(d,'on conflict(classroom_id,held_on) do nothing;',
  'on conflict(classroom_id,held_on,created_by) do nothing;');
 d:=replace(d,'where classroom_id=p_classroom_id and held_on=p_held_on;',
  'where classroom_id=p_classroom_id and held_on=p_held_on and created_by=(select auth.uid());');
 execute d;

 select pg_get_functiondef('private.save_classroom_attendance_sheet_impl(uuid,uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,'where s.id=p_session_id and s.classroom_id=p_classroom_id;',
  'where s.id=p_session_id and s.classroom_id=p_classroom_id and s.created_by=(select auth.uid());');
 if position('s.created_by=( SELECT auth.uid()' in d)=0 and position('s.created_by=(select auth.uid())' in d)=0 then
  raise exception 'Could not apply owner restriction to classroom attendance save function';
 end if;
 execute d;
end $$;

-- Exact-session reader for supervisors; it never grants write access.
create or replace function public.get_classroom_attendance_sheet_by_session(p_session_id uuid)
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
revoke all on function public.get_classroom_attendance_sheet_by_session(uuid) from public,anon;
grant execute on function public.get_classroom_attendance_sheet_by_session(uuid) to authenticated;
