alter table public.teacher_guardian_appointments
  drop constraint if exists teacher_guardian_appointments_status_check;
alter table public.teacher_guardian_appointments
  add constraint teacher_guardian_appointments_status_check
  check (status in ('requested','confirmed','declined','completed','cancelled'));
alter table public.teacher_guardian_appointments
  add column if not exists guardian_response_at timestamptz,
  add column if not exists guardian_response_note text,
  add column if not exists completed_at timestamptz;
alter table public.teacher_guardian_appointments
  add constraint teacher_guardian_appointments_response_note_length
  check (guardian_response_note is null or length(guardian_response_note) <= 500);

create or replace function private.list_my_teacher_guardian_appointments_impl()
returns table(id uuid,student_name text,division_name text,scheduled_at timestamptz,reason text,status text,other_party_name text,guardian_response_note text,teacher_name text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_user_id uuid := (select auth.uid());
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 return query
 select a.id,concat_ws(' ',st.last_name,st.first_name),d.name,a.scheduled_at,a.reason,a.status,
 case when gm.user_id=v_user_id then coalesce(nullif(btrim(tp.display_name),''),concat_ws(' ',tp.first_name,tp.last_name),'Docente')
 else coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor') end,
 a.guardian_response_note,coalesce(nullif(btrim(tp.display_name),''),concat_ws(' ',tp.first_name,tp.last_name),'Docente'),a.created_at
 from public.teacher_guardian_appointments a
 join public.students st on st.id=a.student_id and st.institution_id=a.institution_id
 join public.divisions d on d.id=a.division_id and d.institution_id=a.institution_id
 join public.memberships tm on tm.id=a.teacher_membership_id and tm.institution_id=a.institution_id
 join public.profiles tp on tp.id=tm.user_id
 join public.memberships gm on gm.id=a.guardian_membership_id and gm.institution_id=a.institution_id
 join public.profiles gp on gp.id=gm.user_id
 where tm.user_id=v_user_id or gm.user_id=v_user_id
 order by a.scheduled_at desc,a.created_at desc;
end;
$function$;

create or replace function private.respond_to_teacher_guardian_appointment_impl(p_appointment_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_user_id uuid := (select auth.uid()); v_rows integer;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_decision not in ('confirmed','declined') or coalesce(length(p_note),0)>500 then raise exception 'Invalid response' using errcode='22023'; end if;
 update public.teacher_guardian_appointments a set status=p_decision,guardian_response_at=now(),guardian_response_note=nullif(btrim(p_note),''),updated_at=now()
 from public.memberships gm where a.id=p_appointment_id and gm.id=a.guardian_membership_id and gm.user_id=v_user_id and gm.status='active' and a.status='requested';
 get diagnostics v_rows=row_count;
 if v_rows=0 then raise exception 'Appointment not found or response not allowed' using errcode='42501'; end if;
end;
$function$;

create or replace function private.update_teacher_guardian_appointment_status_impl(p_appointment_id uuid,p_status text)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_user_id uuid := (select auth.uid()); v_rows integer;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_status not in ('completed','cancelled') then raise exception 'Invalid appointment status' using errcode='22023'; end if;
 update public.teacher_guardian_appointments a set status=p_status,completed_at=case when p_status='completed' then now() else null end,updated_at=now()
 from public.memberships tm where a.id=p_appointment_id and tm.id=a.teacher_membership_id and tm.user_id=v_user_id and tm.status='active'
 and ((p_status='completed' and a.status='confirmed') or (p_status='cancelled' and a.status in ('requested','confirmed')));
 get diagnostics v_rows=row_count;
 if v_rows=0 then raise exception 'Appointment not found or transition not allowed' using errcode='42501'; end if;
end;
$function$;

create or replace function public.list_my_teacher_guardian_appointments()
returns table(id uuid,student_name text,division_name text,scheduled_at timestamptz,reason text,status text,other_party_name text,guardian_response_note text,teacher_name text,created_at timestamptz)
language sql stable security invoker set search_path='' as $function$ select * from private.list_my_teacher_guardian_appointments_impl(); $function$;
create or replace function public.respond_to_teacher_guardian_appointment(p_appointment_id uuid,p_decision text,p_note text default null)
returns void language sql security invoker set search_path='' as $function$ select private.respond_to_teacher_guardian_appointment_impl(p_appointment_id,p_decision,p_note); $function$;
create or replace function public.update_teacher_guardian_appointment_status(p_appointment_id uuid,p_status text)
returns void language sql security invoker set search_path='' as $function$ select private.update_teacher_guardian_appointment_status_impl(p_appointment_id,p_status); $function$;
revoke all on function public.list_my_teacher_guardian_appointments() from public,anon;
revoke all on function public.respond_to_teacher_guardian_appointment(uuid,text,text) from public,anon;
revoke all on function public.update_teacher_guardian_appointment_status(uuid,text) from public,anon;
grant execute on function public.list_my_teacher_guardian_appointments() to authenticated;
grant execute on function public.respond_to_teacher_guardian_appointment(uuid,text,text) to authenticated;
grant execute on function public.update_teacher_guardian_appointment_status(uuid,text) to authenticated;