-- Isolated synthetic prerequisites for module transaction tests.
-- This is deliberately NOT a production schema bootstrap.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists private;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.institutions(
 id uuid primary key, display_name text, legal_name text, tax_id text
);
create table public.memberships(
 id uuid primary key, institution_id uuid not null references public.institutions(id),
 user_id uuid not null references auth.users(id), status text not null default 'active',
 unique(id,institution_id)
);
create table public.roles(id uuid primary key,key text unique not null);
create table public.permissions(id uuid primary key default gen_random_uuid(),key text unique not null,description text);
create table public.membership_roles(
 membership_id uuid not null, institution_id uuid not null, role_id uuid not null references public.roles(id),
 primary key(membership_id,role_id)
);
create table public.role_permissions(
 role_id uuid not null references public.roles(id), permission_id uuid not null references public.permissions(id),
 primary key(role_id,permission_id)
);
create table public.divisions(
 id uuid primary key, institution_id uuid not null references public.institutions(id),
 unique(id,institution_id)
);
alter table public.divisions add column course_id uuid;
create table public.course_subjects(
 id uuid primary key,institution_id uuid not null,course_id uuid not null
);
create table public.students(
 id uuid primary key, institution_id uuid not null references public.institutions(id),
 first_name text not null default 'Test', last_name text not null default 'Student',
 student_number text, unique(id,institution_id)
);
create table public.enrollments(
 id uuid primary key default gen_random_uuid(), institution_id uuid not null,
 student_id uuid not null, division_id uuid not null, enrolled_on date not null default current_date,
 ended_on date, status text not null default 'active', created_at timestamptz not null default now(),
 foreign key(student_id,institution_id) references public.students(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id)
);
create or replace function private.can_manage_division(p_division_id uuid,p_institution_id uuid,p_permission text)
returns boolean language sql stable
as $$ select auth.uid()='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
 and p_institution_id='11111111-1111-1111-1111-111111111111'::uuid
 and p_division_id='22222222-2222-2222-2222-222222222222'::uuid
 and p_permission='attendance.manage' $$;
\i supabase/migrations/20261120030658_create_private_permission_helpers.sql
create or replace function private.can_access_student(p_institution_id uuid,p_student_id uuid,p_permission text)
returns boolean language sql stable
as $$ select exists(select 1 from public.students s where s.id=p_student_id and s.institution_id=p_institution_id) $$;

grant usage on schema auth, private to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.memberships, public.enrollments, public.students, public.divisions to authenticated;

insert into public.institutions(id,display_name,legal_name,tax_id) values
 ('11111111-1111-1111-1111-111111111111','Synthetic School','Synthetic School','TEST-ONLY'),
 ('11111111-1111-1111-1111-111111111112','Other Synthetic School','Other Synthetic School','TEST-ONLY-2');
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef');
insert into public.memberships(id,institution_id,user_id,status) values
 ('33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','active'),
 ('33333333-3333-3333-3333-333333333332','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','active'),
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','active'),
 ('33333333-3333-3333-3333-333333333334','11111111-1111-1111-1111-111111111112','dddddddd-dddd-dddd-dddd-dddddddddddd','active'),
 ('33333333-3333-3333-3333-333333333335','11111111-1111-1111-1111-111111111111','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef','active');
insert into public.divisions(id,institution_id) values
 ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111'),
 ('22222222-2222-2222-2222-222222222223','11111111-1111-1111-1111-111111111111');
insert into public.students(id,institution_id,student_number) values
 ('44444444-4444-4444-4444-444444444441','11111111-1111-1111-1111-111111111111','SYN-001'),
 ('44444444-4444-4444-4444-444444444442','11111111-1111-1111-1111-111111111111','SYN-002'),
 ('44444444-4444-4444-4444-444444444443','11111111-1111-1111-1111-111111111111','SYN-003');
insert into public.enrollments(institution_id,student_id,division_id,enrolled_on,status) values
 ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444441','22222222-2222-2222-2222-222222222222',current_date-10,'active'),
 ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444442','22222222-2222-2222-2222-222222222223',current_date-10,'active'),
 ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444443','22222222-2222-2222-2222-222222222222',current_date-10,'active');
insert into public.roles(id,key) values
 ('55555555-5555-5555-5555-555555555551','institution_admin'),
 ('55555555-5555-5555-5555-555555555552','director'),
 ('55555555-5555-5555-5555-555555555553','student'),
 ('55555555-5555-5555-5555-555555555554','teacher'),
 ('55555555-5555-5555-5555-555555555555','guardian');
insert into public.membership_roles values
 ('33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555551'),
 ('33333333-3333-3333-3333-333333333332','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555553'),
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555'),
 ('33333333-3333-3333-3333-333333333335','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555554'),
 ('33333333-3333-3333-3333-333333333334','11111111-1111-1111-1111-111111111112','55555555-5555-5555-5555-555555555551');

-- Synthetic identity/profile links used by the real messaging and classroom RPCs.
create table public.profiles(id uuid primary key references auth.users(id),display_name text,first_name text,last_name text);
insert into public.profiles(id,display_name,first_name,last_name) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Admin sintético','Admin','Test'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Alumno sintético','Alumno','Test'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','Usuario externo','Usuario','Test'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','Usuario de otra institución','Usuario','Externo'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef','Docente sintético','Docente','Test');
create table public.student_memberships(
 student_id uuid not null,institution_id uuid not null,membership_id uuid not null,
 primary key(student_id,membership_id)
);
insert into public.student_memberships values
 ('44444444-4444-4444-4444-444444444441','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333332');
create table public.staff_assignments(
 id uuid primary key default gen_random_uuid(),membership_id uuid,institution_id uuid,
 starts_on date,ends_on date,division_id uuid,course_subject_id uuid,assignment_type text
);
create table public.guardians(
 id uuid primary key default gen_random_uuid(),institution_id uuid,membership_id uuid,receives_notifications boolean not null default true
);
create table public.student_guardians(
 guardian_id uuid,institution_id uuid,student_id uuid,can_view_grades boolean not null default false,
 can_view_attendance boolean not null default false
);
create table public.notification_preferences(
 institution_id uuid,membership_id uuid,notification_type text,in_app_enabled boolean,
 primary key(institution_id,membership_id,notification_type)
);
create table public.notifications(
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,recipient_membership_id uuid not null,
 notification_type text not null,title text not null,body text,resource_type text,resource_id uuid,
 created_at timestamptz not null default now(),read_at timestamptz,
 unique(institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
);
create table public.conversations(
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,subject text,created_by uuid,
 created_at timestamptz not null default now()
);
create table public.conversation_members(
 conversation_id uuid not null,institution_id uuid not null,membership_id uuid not null,
 joined_at timestamptz not null default now(),primary key(conversation_id,membership_id)
);
create table public.messages(
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,conversation_id uuid not null,
 sender_membership_id uuid not null,body text not null,sent_at timestamptz not null default now(),read_at timestamptz
);

-- Actual scoped direct-messaging RPCs and current-relationship revalidation.
\i supabase/migrations/20261120222930_implement_scoped_direct_messaging.sql
\i supabase/migrations/20261120223332_revalidate_messaging_scope_on_existing_conversations.sql




-- Preceptoría: apply the versioned migration, not a handwritten substitute.
\i supabase/migrations/20261125012000_create_prefect_independent_attendance.sql

-- Citations: existing table shape plus the real migration's responsible-party constraint/RPCs.
create table public.teacher_guardian_appointments(
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 division_id uuid not null references public.divisions(id),
 student_id uuid not null references public.students(id),
 teacher_membership_id uuid not null references public.memberships(id),
 guardian_membership_id uuid not null references public.memberships(id),
 scheduled_at timestamptz not null,
 reason text not null,
 status text not null default 'requested',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
\i supabase/migrations/20261125015159_add_prefect_guardian_appointments.sql

-- Calendar: real migration against isolated membership/permission fixtures.
\i supabase/migrations/20261124235500_add_academic_calendar_events_for_directors.sql

-- Classroom delivery: real grading constraint/trigger migration.
create table public.assignments(
 id uuid primary key, institution_id uuid not null references public.institutions(id),
 max_score numeric(7,2), published_at timestamptz
);
alter table public.assignments alter column id set default gen_random_uuid();
create table public.submissions(
 id uuid primary key default gen_random_uuid(), institution_id uuid not null,
 assignment_id uuid not null references public.assignments(id),
 student_id uuid not null references public.students(id),
 score numeric(7,2), body text, submitted_at timestamptz
);
insert into public.assignments(id,institution_id,max_score,published_at)
values ('66666666-6666-6666-6666-666666666661','11111111-1111-1111-1111-111111111111',10,now());
\i supabase/migrations/20261120045012_validate_submission_scores_against_assignment_maximum.sql

-- Classroom synthetic base tables; RPC implementations and audit triggers come from repository migrations.
create table public.virtual_classrooms(
 id uuid primary key,institution_id uuid not null,division_id uuid not null,title text not null,description text,
 course_subject_id uuid, owner_membership_id uuid, created_by uuid,
 created_at timestamptz not null default now()
);
create table public.classroom_members(
 classroom_id uuid not null,institution_id uuid not null,membership_id uuid not null,
 member_role text not null, primary key(classroom_id,membership_id)
);
create table public.classroom_teacher_permissions(
 classroom_id uuid not null,institution_id uuid not null,teacher_membership_id uuid not null,
 is_active boolean not null default true,can_grade boolean not null default false,
 can_edit_materials boolean not null default false,can_edit_assignments boolean not null default false,
 can_attendance boolean not null default false, primary key(classroom_id,teacher_membership_id)
);
create table public.classroom_materials(
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,classroom_id uuid not null,
 title text not null,body text,published_at timestamptz,created_by uuid not null
);
alter table public.assignments add column classroom_id uuid;
alter table public.assignments add column title text;
alter table public.assignments add column instructions text;
alter table public.assignments add column due_at timestamptz;
alter table public.assignments add column created_by uuid;
alter table public.assignments add constraint assignments_classroom_scope_unique unique(id,institution_id);
alter table public.submissions add column feedback text;
alter table public.submissions add column graded_by uuid;
alter table public.submissions add column file_path text;
alter table public.submissions add constraint submissions_scope_unique unique(id,institution_id);
insert into public.virtual_classrooms(id,institution_id,division_id,title,description)
values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-1111-1111-1111-111111111111',
'22222222-2222-2222-2222-222222222222','Aula sintética','Fixture de integración');
update public.virtual_classrooms set owner_membership_id='33333333-3333-3333-3333-333333333335',
 created_by='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef'
 where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
insert into public.staff_assignments(membership_id,institution_id,division_id,assignment_type,starts_on,ends_on)
values('33333333-3333-3333-3333-333333333335','11111111-1111-1111-1111-111111111111',
 '22222222-2222-2222-2222-222222222222','teacher',current_date-10,current_date+10);
insert into public.classroom_members(classroom_id,institution_id,membership_id,member_role)
values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-1111-1111-1111-111111111111',
 '33333333-3333-3333-3333-333333333332','student');
insert into public.guardians(institution_id,membership_id)
values('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333');
insert into public.student_guardians(guardian_id,institution_id,student_id,can_view_grades,can_view_attendance)
select g.id,g.institution_id,'44444444-4444-4444-4444-444444444441',true,true
from public.guardians g where g.membership_id='33333333-3333-3333-3333-333333333333';
update public.assignments set classroom_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 title='Tarea de puntaje',instructions='Tarea de fixture',created_by='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 where id='66666666-6666-6666-6666-666666666661';

insert into public.permissions(key,description) values
 ('classroom.manage','Manage synthetic classroom'),
 ('classroom.read','Read synthetic classroom'),
 ('classroom.submit','Submit synthetic classroom assignment'),
 ('classroom.grade','Grade synthetic classroom submission')
on conflict(key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select '55555555-5555-5555-5555-555555555551',id from public.permissions
where key in ('classroom.manage','classroom.read','classroom.grade')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select '55555555-5555-5555-5555-555555555553',id from public.permissions
where key in ('classroom.read','classroom.submit')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select '55555555-5555-5555-5555-555555555554',id from public.permissions
where key in ('classroom.manage','classroom.read','classroom.grade')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select '55555555-5555-5555-5555-555555555555',id from public.permissions
where key='classroom.read'
on conflict do nothing;


\i supabase/migrations/20261120042544_scope_classroom_submissions.sql
\i supabase/migrations/20261120044813_add_submission_revision_and_grade_history.sql
\i supabase/migrations/20261120212102_add_scoped_classroom_content_creation.sql
\i supabase/migrations/20261120212332_add_scoped_classroom_assignment_submission.sql
\i supabase/migrations/20261120212822_add_scoped_classroom_submission_review_and_grading.sql

-- Boletines: exact snapshot immutability migration; supporting FK targets are synthetic.
create table public.academic_years(id uuid primary key,institution_id uuid not null, name text, starts_on date, ends_on date, grading_scale_id uuid);
create table public.grading_periods(
 id uuid primary key,institution_id uuid not null,academic_year_id uuid not null,
 name text,starts_on date,ends_on date,unique(id,institution_id)
);
create table public.report_card_workflows(
 id uuid primary key,institution_id uuid not null,student_id uuid not null,grading_period_id uuid not null,
 status text not null default 'draft',published_at timestamptz,published_by_membership_id uuid,
 unique(id,institution_id)
);
create table public.report_card_snapshots_placeholder(id uuid);
\i supabase/migrations/20261120172800_add_report_card_immutable_snapshots.sql

-- Soporte: exercise the actual lifecycle trigger against an isolated ticket fixture.
create table public.support_tickets(
 id uuid primary key default gen_random_uuid(),status text not null default 'open',
 priority text not null default 'normal',first_response_at timestamptz,
 resolved_at timestamptz,closed_at timestamptz,updated_at timestamptz not null default now()
);
\i supabase/migrations/20261120210046_manage_support_ticket_lifecycle_timestamps.sql

-- Apply the exact versioned role-scoped authorization implementation after all classroom prerequisites exist.
\i supabase/migrations/20261124224714_enforce_role_scoped_academic_permissions.sql

-- Removed the previous structural-only messaging stand-in; tests now execute the repository RPC migrations.
