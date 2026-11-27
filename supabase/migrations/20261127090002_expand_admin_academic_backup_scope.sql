alter function private.academic_year_snapshot(uuid,uuid) rename to academic_year_snapshot_v1;
create or replace function private.academic_year_snapshot(p_institution_id uuid,p_year_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_snapshot jsonb;
begin
 v_snapshot:=private.academic_year_snapshot_v1(p_institution_id,p_year_id);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,guardians}',(
  select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from public.guardians g
  where g.institution_id=p_institution_id and g.id in (
   select sg.guardian_id from public.student_guardians sg
   where sg.institution_id=p_institution_id and sg.student_id in (
    select e.student_id from public.enrollments e join public.divisions d
     on d.id=e.division_id and d.institution_id=e.institution_id
    where e.institution_id=p_institution_id and d.academic_year_id=p_year_id
   )
  )
 ),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,student_guardians}',(
  select coalesce(jsonb_agg(to_jsonb(sg)),'[]'::jsonb) from public.student_guardians sg
  where sg.institution_id=p_institution_id and sg.student_id in (
   select e.student_id from public.enrollments e join public.divisions d
    on d.id=e.division_id and d.institution_id=e.institution_id
   where e.institution_id=p_institution_id and d.academic_year_id=p_year_id
  )
 ),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,student_memberships}',(
  select coalesce(jsonb_agg(to_jsonb(sm)),'[]'::jsonb) from public.student_memberships sm
  where sm.institution_id=p_institution_id and sm.student_id in (
   select e.student_id from public.enrollments e join public.divisions d
    on d.id=e.division_id and d.institution_id=e.institution_id
   where e.institution_id=p_institution_id and d.academic_year_id=p_year_id
  )
 ),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,announcements}',(
  select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.announcements a
  where a.institution_id=p_institution_id and (
   a.division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)
   or a.division_id is null
  )
 ),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,academic_calendar_events}',(
  select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from public.academic_calendar_events e
  join public.academic_years ay on ay.id=p_year_id and ay.institution_id=p_institution_id
  where e.institution_id=p_institution_id
   and coalesce(e.ends_at,e.starts_at)>=ay.starts_on::timestamptz
   and e.starts_at<(ay.ends_on+1)::timestamptz
 ),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,prefect_attendance_sessions}',(
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.prefect_attendance_sessions s
  where s.institution_id=p_institution_id and s.division_id in (
   select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id
  )
 ),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,prefect_attendance_records}',(
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.prefect_attendance_records r
  where r.institution_id=p_institution_id and r.session_id in (
   select id from public.prefect_attendance_sessions where institution_id=p_institution_id and division_id in (
    select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id
   )
  )
 ),true);
 v_snapshot:=jsonb_set(v_snapshot,'{tables,prefect_novelties}',(
  select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) from public.prefect_novelties n
  where n.institution_id=p_institution_id and n.division_id in (
   select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id
  )
 ),true);
 return v_snapshot;
end;
$function$;
revoke all on function private.academic_year_snapshot_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function private.academic_year_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function private.academic_year_snapshot(uuid,uuid) to authenticated;

alter function private.restore_academic_year_backup_impl(uuid,uuid,uuid) rename to restore_academic_year_backup_v1;
create or replace function private.restore_academic_year_backup_impl(p_institution_id uuid,p_academic_year_id uuid,p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_snapshot jsonb;v_result jsonb;
begin
 v_result:=private.restore_academic_year_backup_v1(p_institution_id,p_academic_year_id,p_backup_id);
 select snapshot into v_snapshot from public.institution_academic_backups
 where id=p_backup_id and institution_id=p_institution_id and academic_year_id=p_academic_year_id;
 insert into public.guardians select * from jsonb_populate_recordset(null::public.guardians,v_snapshot->'tables'->'guardians') on conflict do nothing;
 insert into public.student_guardians select * from jsonb_populate_recordset(null::public.student_guardians,v_snapshot->'tables'->'student_guardians') on conflict do nothing;
 insert into public.student_memberships select * from jsonb_populate_recordset(null::public.student_memberships,v_snapshot->'tables'->'student_memberships') on conflict do nothing;
 insert into public.announcements select * from jsonb_populate_recordset(null::public.announcements,v_snapshot->'tables'->'announcements') on conflict do nothing;
 insert into public.academic_calendar_events select * from jsonb_populate_recordset(null::public.academic_calendar_events,v_snapshot->'tables'->'academic_calendar_events') on conflict do nothing;
 insert into public.prefect_attendance_sessions select * from jsonb_populate_recordset(null::public.prefect_attendance_sessions,v_snapshot->'tables'->'prefect_attendance_sessions') on conflict do nothing;
 insert into public.prefect_attendance_records select * from jsonb_populate_recordset(null::public.prefect_attendance_records,v_snapshot->'tables'->'prefect_attendance_records') on conflict do nothing;
 insert into public.prefect_novelties select * from jsonb_populate_recordset(null::public.prefect_novelties,v_snapshot->'tables'->'prefect_novelties') on conflict do nothing;
 return v_result;
end;
$function$;
revoke all on function private.restore_academic_year_backup_v1(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.restore_academic_year_backup_impl(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.restore_academic_year_backup_impl(uuid,uuid,uuid) to authenticated;
