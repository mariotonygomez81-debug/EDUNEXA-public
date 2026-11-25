\set ON_ERROR_STOP on
-- All assertions use synthetic IDs and the isolated PostgreSQL service only.

-- Preceptoría: authenticated assigned preceptor can open a session and mark attendance.
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
insert into public.prefect_attendance_sessions(institution_id,division_id,held_on,period_label)
values('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',current_date,'turno-mañana');
insert into public.prefect_attendance_records(institution_id,session_id,student_id,status,note)
select s.institution_id,s.id,'44444444-4444-4444-4444-444444444441','present','Fixture de prueba'
from public.prefect_attendance_sessions s where s.held_on=current_date;
do $$ begin
 if (select count(*) from public.prefect_attendance_records)<>1 then raise exception 'Attendance record did not persist'; end if;
 begin
  insert into public.prefect_attendance_records(institution_id,session_id,student_id,status)
  select s.institution_id,s.id,'44444444-4444-4444-4444-444444444441','absent'
  from public.prefect_attendance_sessions s where s.held_on=current_date;
  raise exception 'Duplicate attendance record unexpectedly accepted';
 exception when unique_violation then null; end;
 begin
  insert into public.prefect_attendance_records(institution_id,session_id,student_id,status)
  select s.institution_id,s.id,'44444444-4444-4444-4444-444444444443','invalid'
  from public.prefect_attendance_sessions s where s.held_on=current_date;
  raise exception 'Invalid attendance status unexpectedly accepted';
 exception when check_violation then null; end;
end $$;
update public.prefect_attendance_sessions set status='closed' where held_on=current_date;
do $$ begin
 begin
  insert into public.prefect_attendance_records(institution_id,session_id,student_id,status)
  select s.institution_id,s.id,'44444444-4444-4444-4444-444444444443','absent'
  from public.prefect_attendance_sessions s where s.held_on=current_date;
  raise exception 'Closed attendance session accepted a record';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Citations: exactly one responsible staff member is enforced by the real migration.
insert into public.teacher_guardian_appointments(
 institution_id,division_id,student_id,teacher_membership_id,prefect_membership_id,
 guardian_membership_id,scheduled_at,reason
) values (
 '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
 '44444444-4444-4444-4444-444444444441',null,'33333333-3333-3333-3333-333333333331',
 '33333333-3333-3333-3333-333333333332',now()+interval '1 day','Entrevista sintética'
);
do $$ begin
 begin
  insert into public.teacher_guardian_appointments(
   institution_id,division_id,student_id,teacher_membership_id,prefect_membership_id,
   guardian_membership_id,scheduled_at,reason
  ) values (
   '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
   '44444444-4444-4444-4444-444444444441','33333333-3333-3333-3333-333333333331',
   '33333333-3333-3333-3333-333333333332','33333333-3333-3333-3333-333333333333',
   now()+interval '1 day','Ambos responsables'
  );
  raise exception 'Appointment with two responsible staff accepted';
 exception when check_violation then null; end;
end $$;

-- Calendar: only an authorized institutional member may create an event.
insert into public.permissions(key,description) values('academic_calendar.manage','test') on conflict (key) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select '55555555-5555-5555-5555-555555555551',id from public.permissions where key='academic_calendar.manage'
on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
insert into public.academic_calendar_events(institution_id,title,category,starts_at,ends_at,created_by_membership_id)
values('11111111-1111-1111-1111-111111111111','Feria sintética','feria',now()+interval '2 days',now()+interval '2 days 2 hours','33333333-3333-3333-3333-333333333331');
do $$ begin
 if (select count(*) from public.academic_calendar_events)<>1 then raise exception 'Calendar event not persisted'; end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
do $$ begin
 begin
  insert into public.academic_calendar_events(institution_id,title,category,starts_at,created_by_membership_id)
  values('11111111-1111-1111-1111-111111111111','Evento sin permiso','otro',now(),'33333333-3333-3333-3333-333333333332');
  raise exception 'Unauthorized calendar insert unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Classroom/assignments: score is persisted within the maximum; out-of-range and negative scores fail.
insert into public.submissions(institution_id,assignment_id,student_id,score,body)
values('11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666661',
'44444444-4444-4444-4444-444444444441',8,'Entrega sintética');
do $$ begin
 begin
  insert into public.submissions(institution_id,assignment_id,student_id,score)
  values('11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666661',
  '44444444-4444-4444-4444-444444444442',11);
  raise exception 'Score above assignment maximum accepted';
 exception when check_violation then null; end;
 begin
  update public.submissions set score=-1 where score=8;
  raise exception 'Negative score accepted';
 exception when check_violation then null; end;
 if (select score from public.submissions where student_id='44444444-4444-4444-4444-444444444441')<>8 then
  raise exception 'Valid submission score did not persist';
 end if;
end $$;

-- Report cards: actual snapshot trigger rejects UPDATE and DELETE (immutability).
insert into public.report_card_workflows(id,institution_id,student_id,grading_period_id,status)
values('77777777-7777-7777-7777-777777777771','11111111-1111-1111-1111-111111111111',
'44444444-4444-4444-4444-444444444441','88888888-8888-8888-8888-888888888881','draft');
insert into public.grading_periods(id,institution_id,academic_year_id,name,starts_on,ends_on)
values('88888888-8888-8888-8888-888888888881','11111111-1111-1111-1111-111111111111',
'99999999-9999-9999-9999-999999999991','Período sintético',current_date-30,current_date);
insert into public.academic_years(id,institution_id,name,starts_on,ends_on)
values('99999999-9999-9999-9999-999999999991','11111111-1111-1111-1111-111111111111',
'Ciclo sintético',current_date-90,current_date+90);
insert into public.report_card_snapshots(workflow_id,institution_id,student_id,grading_period_id,snapshot)
values('77777777-7777-7777-7777-777777777771','11111111-1111-1111-1111-111111111111',
'44444444-4444-4444-4444-444444444441','88888888-8888-8888-8888-888888888881','{"fixture":true}'::jsonb);
do $$ begin
 begin
  update public.report_card_snapshots set snapshot='{"changed":true}' where workflow_id='77777777-7777-7777-7777-777777777771';
  raise exception 'Published snapshot UPDATE unexpectedly succeeded';
 exception when raise_exception then
  if sqlerrm not like 'Published report card snapshots are immutable' then raise; end if;
 end;
 begin
  delete from public.report_card_snapshots where workflow_id='77777777-7777-7777-7777-777777777771';
  raise exception 'Published snapshot DELETE unexpectedly succeeded';
 exception when raise_exception then
  if sqlerrm not like 'Published report card snapshots are immutable' then raise; end if;
 end;
end $$;

-- Support: lifecycle timestamps are server-managed; client values cannot forge first_response_at.
insert into public.support_tickets(id,status,first_response_at)
values('abababab-abab-abab-abab-abababababab','open',null);
update public.support_tickets set status='resolved',first_response_at='2000-01-01' where id='abababab-abab-abab-abab-abababababab';
do $$ begin
 if (select resolved_at is null or first_response_at is not null from public.support_tickets where id='abababab-abab-abab-abab-abababababab') then
  raise exception 'Support lifecycle timestamp management failed';
 end if;
end $$;
update public.support_tickets set status='reopened' where id='abababab-abab-abab-abab-abababababab';
do $$ begin
 if (select resolved_at is not null or closed_at is not null from public.support_tickets where id='abababab-abab-abab-abab-abababababab') then
  raise exception 'Reopening did not clear resolution/closure timestamps';
 end if;
end $$;

-- Messaging structural contracts: membership from another institution cannot join a conversation.
insert into public.contract_conversations(id,institution_id)
values('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','11111111-1111-1111-1111-111111111111');
insert into public.contract_conversation_members(conversation_id,institution_id,membership_id)
values('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','11111111-1111-1111-1111-111111111111',
'33333333-3333-3333-3333-333333333331');
do $$ begin
 begin
  insert into public.contract_conversation_members(conversation_id,institution_id,membership_id)
  values('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333332');
  raise exception 'Cross-institution conversation membership accepted';
 exception when foreign_key_violation then null; end;
end $$;
insert into public.contract_messages(conversation_id,institution_id,sender_membership_id,body)
values('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','11111111-1111-1111-1111-111111111111',
'33333333-3333-3333-3333-333333333331','Mensaje de prueba');
do $$ begin
 begin
  insert into public.contract_messages(conversation_id,institution_id,sender_membership_id,body)
  values('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333331','   ');
  raise exception 'Blank message accepted';
 exception when check_violation then null; end;
end $$;

select 'PASS: isolated module transaction contracts (attendance, appointments, calendar, classroom grading, report snapshots, support lifecycle, messaging structure).' as result;
