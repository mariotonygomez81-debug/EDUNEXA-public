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

-- Classroom: execute the real content, assignment, submission, revision, and grading RPCs.
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
select public.create_classroom_material(
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Material de integración','Contenido publicado',true
) as classroom_material_id \\gset
select public.create_classroom_assignment(
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','RPC integration assignment',
 'Complete the synthetic task',now()+interval '2 days',10,true
) as classroom_assignment_id \\gset
reset role;
do $$ begin
 if not exists(select 1 from public.classroom_materials where title='Material de integración' and published_at is not null) then
  raise exception 'Classroom material RPC did not persist a published material';
 end if;
 if not exists(select 1 from public.assignments where title='RPC integration assignment' and published_at is not null and max_score=10) then
  raise exception 'Classroom assignment RPC did not persist a published assignment';
 end if;
end $$;

-- A student with active enrollment submits, edits once, and gets a versioned revision trail.
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
select public.submit_classroom_assignment(:'classroom_assignment_id'::uuid,'Primera entrega') as classroom_submission_id \\gset
select public.submit_classroom_assignment(:'classroom_assignment_id'::uuid,'Entrega corregida');
reset role;
do $$ begin
 if not exists(select 1 from public.submissions where assignment_id=(select id from public.assignments where title='RPC integration assignment')
   and body='Entrega corregida' and score is null) then
  raise exception 'Student submission RPC did not persist the updated delivery';
 end if;
 if (select count(*) from public.submission_revisions where submission_id=:'classroom_submission_id'::uuid)<>2 then
  raise exception 'Submission edit did not create the expected revision history';
 end if;
 if not exists(select 1 from public.submission_revisions where submission_id=:'classroom_submission_id'::uuid and body='Primera entrega') then
  raise exception 'Submission revision did not preserve the previous body';
 end if;
end $$;

-- Authorized institutional staff grades through the real RPC.
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
select public.grade_classroom_submission(:'classroom_submission_id'::uuid,7,'Buen trabajo');
reset role;
do $$ declare v_submission uuid; begin
 v_submission:=:'classroom_submission_id'::uuid;
 if not exists(select 1 from public.submissions where id=v_submission and score=7 and feedback='Buen trabajo') then
  raise exception 'Grade RPC did not persist score and feedback';
 end if;
 if not exists(select 1 from public.submission_grade_events where submission_id=v_submission and new_score=7) then
  raise exception 'Grade RPC did not write grade audit event';
 end if;
 begin
  perform public.grade_classroom_submission(v_submission,11,'Fuera de rango');
  raise exception 'Grade above assignment maximum unexpectedly succeeded';
 exception when check_violation then null; end;
end $$;

-- A student cannot edit a graded submission; a non-member cannot create classroom content.
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
do $$ declare v_assignment uuid; begin
 select id into v_assignment from public.assignments where title='RPC integration assignment';
 begin
  perform public.submit_classroom_assignment(v_assignment,'Intento de edición luego de calificar');
  raise exception 'Graded submission was unexpectedly editable';
 exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false);
do $$ begin
 begin
  perform public.create_classroom_material('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Material no autorizado','No',true);
  raise exception 'Non-member created classroom material';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

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

-- Messaging: execute real direct-conversation, message, notification, read, and institution-scope RPCs.
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
do $$ declare v_conversation uuid; v_message uuid; begin
 v_conversation:=public.create_direct_conversation(
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333332',
  'Conversación de integración'
 );
 v_message:=public.send_conversation_message(
  '11111111-1111-1111-1111-111111111111',v_conversation,'Mensaje transaccional sintético'
 );
 if v_conversation is null or v_message is null then
  raise exception 'Messaging RPC returned an empty identifier';
 end if;
end $$;
reset role;
do $$ declare v_conversation uuid; begin
 select id into v_conversation from public.conversations where subject='Conversación de integración';
 if not exists(select 1 from public.messages where conversation_id=v_conversation and body='Mensaje transaccional sintético') then
  raise exception 'Messaging send RPC did not persist the message';
 end if;
 if not exists(select 1 from public.notifications where recipient_membership_id='33333333-3333-3333-3333-333333333332'
   and notification_type='message' and resource_id=v_conversation) then
  raise exception 'Messaging notification fanout did not notify the counterpart';
 end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
do $$ declare v_conversation uuid; v_read integer; begin
 select id into v_conversation from public.conversations where subject='Conversación de integración';
 if (select count(*) from public.list_conversation_messages(
  '11111111-1111-1111-1111-111111111111',v_conversation,50
 ))<>1 then raise exception 'Conversation member could not read the message'; end if;
 v_read:=public.mark_conversation_read('11111111-1111-1111-1111-111111111111',v_conversation);
 if v_read<>1 then raise exception 'Mark-read RPC did not mark exactly one incoming message'; end if;
end $$;
reset role;
do $$ declare v_conversation uuid; begin
 select id into v_conversation from public.conversations where subject='Conversación de integración';
 if not exists(select 1 from public.messages where conversation_id=v_conversation and read_at is not null) then
  raise exception 'Message read timestamp was not persisted';
 end if;
end $$;

-- A membership belonging to a different institution cannot read or send into this conversation.
set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-dddd-dddd-dddddddddddd',false);
do $$ declare v_conversation uuid; begin
 select id into v_conversation from public.conversations where subject='Conversación de integración';
 begin
  perform * from public.list_conversation_messages('11111111-1111-1111-1111-111111111111',v_conversation,50);
  raise exception 'Cross-institution membership read a private conversation';
 exception when insufficient_privilege then null; end;
 begin
  perform public.send_conversation_message('11111111-1111-1111-1111-111111111111',v_conversation,'No autorizado');
  raise exception 'Cross-institution membership sent a private message';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'PASS: isolated module transaction contracts (attendance, appointments, calendar, real classroom RPCs and history, real messaging RPCs and notifications, report snapshots, support lifecycle).' as result;
