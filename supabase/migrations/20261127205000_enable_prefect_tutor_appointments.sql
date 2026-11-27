-- Extend the existing tutor interview workflow to assigned prefects.
create or replace function private.list_teacher_guardian_contacts_impl(p_division_id uuid)
returns table(student_id uuid,student_name text,guardian_membership_id uuid,guardian_name text)
language plpgsql stable security definer set search_path=''
as $function$
declare v_institution_id uuid; v_staff_membership_id uuid; v_role text; v_assignment_type text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select m.id,m.institution_id,r.key into v_staff_membership_id,v_institution_id,v_role
 from public.memberships m
 join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.roles r on r.id=mr.role_id
 where m.user_id=(select auth.uid()) and m.status='active' and r.key in ('teacher','prefect')
 order by case when r.key='teacher' then 0 else 1 end limit 1;
 if v_staff_membership_id is null then raise exception 'Active teacher or prefect membership required' using errcode='42501'; end if;
 v_assignment_type := case when v_role='prefect' then 'prefect' else 'teacher' end;
 if not exists(
  select 1 from public.staff_assignments sa
  where sa.membership_id=v_staff_membership_id and sa.institution_id=v_institution_id
   and sa.assignment_type=v_assignment_type and sa.division_id=p_division_id
   and (sa.starts_on is null or sa.starts_on<=current_date)
   and (sa.ends_on is null or sa.ends_on>=current_date)
 ) then raise exception 'Division access denied' using errcode='42501'; end if;
 return query
 select st.id,concat_ws(' ',st.last_name,st.first_name),gm.id,
  coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor')
 from public.enrollments e
 join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
 join public.student_guardians sg on sg.student_id=st.id and sg.institution_id=st.institution_id
 join public.guardians g on g.id=sg.guardian_id and g.institution_id=sg.institution_id
 join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id and gm.status='active'
 join public.profiles gp on gp.id=gm.user_id
 where e.institution_id=v_institution_id and e.division_id=p_division_id
  and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
  and st.status='active'
 order by st.last_name,st.first_name,gp.last_name,gp.first_name;
end;
$function$;

create or replace function private.create_teacher_guardian_appointment_impl(
 p_student_id uuid,p_guardian_membership_id uuid,p_scheduled_at timestamptz,p_reason text
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_institution_id uuid; v_staff_membership_id uuid; v_division_id uuid; v_id uuid; v_role text; v_assignment_type text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_scheduled_at is null or p_scheduled_at<=now()
  or p_reason is null or length(btrim(p_reason))<3 or length(p_reason)>1000 then
  raise exception 'Invalid appointment details' using errcode='22023';
 end if;
 select m.id,m.institution_id,r.key into v_staff_membership_id,v_institution_id,v_role
 from public.memberships m
 join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.roles r on r.id=mr.role_id
 where m.user_id=(select auth.uid()) and m.status='active' and r.key in ('teacher','prefect')
 order by case when r.key='teacher' then 0 else 1 end limit 1;
 if v_staff_membership_id is null then raise exception 'Teacher or prefect role required' using errcode='42501'; end if;
 v_assignment_type := case when v_role='prefect' then 'prefect' else 'teacher' end;
 select e.division_id into v_division_id
 from public.enrollments e
 join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
 where e.student_id=p_student_id and e.institution_id=v_institution_id and e.status='active'
  and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
  and st.status='active'
  and exists(select 1 from public.staff_assignments sa
   where sa.membership_id=v_staff_membership_id and sa.institution_id=v_institution_id
    and sa.assignment_type=v_assignment_type and sa.division_id=e.division_id
    and (sa.starts_on is null or sa.starts_on<=current_date)
    and (sa.ends_on is null or sa.ends_on>=current_date))
 limit 1;
 if v_division_id is null or not exists(
  select 1 from public.guardians g
  join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
  join public.memberships gm on gm.id=g.membership_id and gm.institution_id=g.institution_id and gm.status='active'
  where sg.student_id=p_student_id and sg.institution_id=v_institution_id and gm.id=p_guardian_membership_id
 ) then raise exception 'Guardian is not linked to this student in an assigned division' using errcode='42501'; end if;
 insert into public.teacher_guardian_appointments(
  institution_id,division_id,student_id,teacher_membership_id,guardian_membership_id,scheduled_at,reason
 ) values(v_institution_id,v_division_id,p_student_id,v_staff_membership_id,p_guardian_membership_id,p_scheduled_at,btrim(p_reason))
 returning id into v_id;
 return v_id;
end;
$function$;

create or replace function private.list_my_teacher_guardian_appointment_details_impl()
returns table(
 appointment_id uuid,student_id uuid,student_name text,teacher_name text,guardian_name text,
 scheduled_at timestamptz,reason text,status text,created_at timestamptz,updated_at timestamptz,
 guardian_response_note text,guardian_proposed_at timestamptz,conversation jsonb
)
language plpgsql stable security definer set search_path=''
as $function$
declare v_user_id uuid := (select auth.uid()); v_membership_id uuid; v_institution_id uuid; v_role text;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select m.id,m.institution_id,r.key into v_membership_id,v_institution_id,v_role
 from public.memberships m
 join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.roles r on r.id=mr.role_id
 where m.user_id=v_user_id and m.status='active' and r.key in ('teacher','prefect','guardian')
 order by case when r.key='guardian' then 0 when r.key='teacher' then 1 else 2 end limit 1;
 if v_membership_id is null then raise exception 'Active teacher, prefect or guardian membership required' using errcode='42501'; end if;
 return query
 select a.id,a.student_id,concat_ws(' ',st.last_name,st.first_name),
  coalesce(nullif(btrim(tp.display_name),''),concat_ws(' ',tp.first_name,tp.last_name),
   case when v_role='prefect' then 'Preceptoría' else 'Docente' end),
  coalesce(nullif(btrim(gp.display_name),''),concat_ws(' ',gp.first_name,gp.last_name),'Tutor'),
  a.scheduled_at,a.reason,a.status,a.created_at,a.updated_at,
  a.guardian_response_note,a.guardian_proposed_at,
  coalesce((select jsonb_agg(jsonb_build_object(
   'id',ev.id,'event_type',ev.event_type,'body',ev.body,'proposed_at',ev.proposed_at,
   'created_at',ev.created_at,'actor_name',
   coalesce(nullif(btrim(ap.display_name),''),concat_ws(' ',ap.first_name,ap.last_name),'Usuario')
  ) order by ev.created_at,ev.id)
  from public.teacher_guardian_appointment_events ev
  join public.memberships em on em.id=ev.actor_membership_id and em.institution_id=ev.institution_id
  join public.profiles ap on ap.id=em.user_id
  where ev.appointment_id=a.id),'[]'::jsonb)
 from public.teacher_guardian_appointments a
 join public.students st on st.id=a.student_id and st.institution_id=a.institution_id
 join public.memberships tm on tm.id=a.teacher_membership_id and tm.institution_id=a.institution_id
 join public.profiles tp on tp.id=tm.user_id
 join public.memberships gm on gm.id=a.guardian_membership_id and gm.institution_id=a.institution_id
 join public.profiles gp on gp.id=gm.user_id
 where a.institution_id=v_institution_id
  and ((v_role='teacher' and a.teacher_membership_id=v_membership_id)
   or (v_role='prefect' and a.teacher_membership_id=v_membership_id and exists(
    select 1 from public.staff_assignments sa
    where sa.membership_id=v_membership_id and sa.institution_id=a.institution_id
     and sa.assignment_type='prefect' and sa.division_id=a.division_id
     and (sa.starts_on is null or sa.starts_on<=current_date)
     and (sa.ends_on is null or sa.ends_on>=current_date)))
   or (v_role='guardian' and a.guardian_membership_id=v_membership_id))
 order by a.scheduled_at desc,a.created_at desc;
end;
$function$;

create or replace function private.accept_teacher_guardian_appointment_proposal_impl(p_appointment_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_proposed_at timestamptz; v_rows integer; v_role text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select m.id,m.institution_id,r.key into v_membership_id,v_institution_id,v_role
 from public.memberships m
 join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.roles r on r.id=mr.role_id
 where m.user_id=(select auth.uid()) and m.status='active' and r.key in ('teacher','prefect')
 order by case when r.key='teacher' then 0 else 1 end limit 1;
 if v_membership_id is null then raise exception 'Active teacher or prefect membership required' using errcode='42501'; end if;
 select a.guardian_proposed_at into v_proposed_at
 from public.teacher_guardian_appointments a
 where a.id=p_appointment_id and a.institution_id=v_institution_id
  and a.teacher_membership_id=v_membership_id and a.status='rejected'
  and a.guardian_proposed_at>now()
  and (v_role<>'prefect' or exists(select 1 from public.staff_assignments sa
   where sa.membership_id=v_membership_id and sa.institution_id=a.institution_id
    and sa.assignment_type='prefect' and sa.division_id=a.division_id
    and (sa.starts_on is null or sa.starts_on<=current_date)
    and (sa.ends_on is null or sa.ends_on>=current_date)))
 for update;
 if v_proposed_at is null then raise exception 'No current alternative time proposal' using errcode='42501'; end if;
 update public.teacher_guardian_appointments
 set scheduled_at=v_proposed_at,status='requested',guardian_response_at=null,
  guardian_response_note=null,guardian_proposed_at=null,updated_at=now()
 where id=p_appointment_id and institution_id=v_institution_id
  and teacher_membership_id=v_membership_id and status='rejected';
 insert into public.teacher_guardian_appointment_events(
  institution_id,appointment_id,actor_membership_id,event_type,body,proposed_at
 ) values(v_institution_id,p_appointment_id,v_membership_id,'teacher_accepted_proposal',
  case when v_role='prefect' then 'Preceptoría aceptó el horario alternativo. La citación fue reenviada para confirmación.'
   else 'El docente aceptó el horario alternativo. La citación fue reenviada para confirmación.' end,v_proposed_at);
 return true;
end;
$function$;

create or replace function private.update_teacher_guardian_appointment_impl(p_appointment_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_updated integer; v_role text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_status not in ('completed','cancelled') then raise exception 'Invalid appointment status' using errcode='22023'; end if;
 select m.id,m.institution_id,r.key into v_membership_id,v_institution_id,v_role
 from public.memberships m
 join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.roles r on r.id=mr.role_id
 where m.user_id=(select auth.uid()) and m.status='active' and r.key in ('teacher','prefect')
 order by case when r.key='teacher' then 0 else 1 end limit 1;
 if v_membership_id is null then raise exception 'Active teacher or prefect membership required' using errcode='42501'; end if;
 update public.teacher_guardian_appointments a
 set status=p_status,updated_at=now()
 where a.id=p_appointment_id and a.institution_id=v_institution_id
  and a.teacher_membership_id=v_membership_id
  and (v_role<>'prefect' or exists(select 1 from public.staff_assignments sa
   where sa.membership_id=v_membership_id and sa.institution_id=a.institution_id
    and sa.assignment_type='prefect' and sa.division_id=a.division_id
    and (sa.starts_on is null or sa.starts_on<=current_date)
    and (sa.ends_on is null or sa.ends_on>=current_date)))
  and ((p_status='completed' and a.status='confirmed')
   or (p_status='cancelled' and a.status in ('requested','confirmed')));
 get diagnostics v_updated=row_count;
 if v_updated=0 then raise exception 'Appointment not found or invalid status transition' using errcode='42501'; end if;
 insert into public.teacher_guardian_appointment_events(
  institution_id,appointment_id,actor_membership_id,event_type,body
 ) values(v_institution_id,p_appointment_id,v_membership_id,
  case when p_status='completed' then 'interview_completed' else 'appointment_cancelled' end,
  case when p_status='completed' then 'La entrevista fue registrada como realizada por el responsable institucional.'
   else 'La citación fue cancelada por el responsable institucional.' end);
 return true;
end;
$function$;

revoke all on function private.list_teacher_guardian_contacts_impl(uuid) from public,anon;
revoke all on function private.create_teacher_guardian_appointment_impl(uuid,uuid,timestamptz,text) from public,anon;
revoke all on function private.list_my_teacher_guardian_appointment_details_impl() from public,anon;
revoke all on function private.accept_teacher_guardian_appointment_proposal_impl(uuid) from public,anon;
revoke all on function private.update_teacher_guardian_appointment_impl(uuid,text) from public,anon;
grant execute on function private.list_teacher_guardian_contacts_impl(uuid) to authenticated;
grant execute on function private.create_teacher_guardian_appointment_impl(uuid,uuid,timestamptz,text) to authenticated;
grant execute on function private.list_my_teacher_guardian_appointment_details_impl() to authenticated;
grant execute on function private.accept_teacher_guardian_appointment_proposal_impl(uuid) to authenticated;
grant execute on function private.update_teacher_guardian_appointment_impl(uuid,text) to authenticated;
