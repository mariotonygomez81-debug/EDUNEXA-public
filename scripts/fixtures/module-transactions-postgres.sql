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
create table public.students(
 id uuid primary key, institution_id uuid not null references public.institutions(id),
 first_name text not null default 'Test', last_name text not null default 'Student',
 student_number text, unique(id,institution_id)
);
create table public.enrollments(
 id uuid primary key default gen_random_uuid(), institution_id uuid not null,
 student_id uuid not null, division_id uuid not null, enrolled_on date not null default current_date,
 ended_on date, status text not null default 'active',
 foreign key(student_id,institution_id) references public.students(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id)
);
create or replace function private.can_manage_division(p_division_id uuid,p_institution_id uuid,p_permission text)
returns boolean language sql stable
as $$ select auth.uid()='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
 and p_institution_id='11111111-1111-1111-1111-111111111111'::uuid
 and p_division_id='22222222-2222-2222-2222-222222222222'::uuid
 and p_permission='attendance.manage' $$;
create or replace function private.has_institution_permission(p_institution_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path=''
as $ select exists (
 select 1 from public.memberships m join public.membership_roles mr
 on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.role_permissions rp on rp.role_id=mr.role_id
 join public.permissions p on p.id=rp.permission_id
 where m.user_id=auth.uid() and m.institution_id=p_institution_id
 and m.status='active' and p.key=p_permission_key
) $$;
create or replace function private.can_access_student(p_institution_id uuid,p_student_id uuid,p_permission text)
returns boolean language sql stable
as $$ select exists(select 1 from public.students s where s.id=p_student_id and s.institution_id=p_institution_id) $$;

grant select on public.memberships to authenticated;

insert into public.institutions(id,display_name,legal_name,tax_id) values
 ('11111111-1111-1111-1111-111111111111','Synthetic School','Synthetic School','TEST-ONLY');
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.memberships(id,institution_id,user_id,status) values
 ('33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','active'),
 ('33333333-3333-3333-3333-333333333332','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','active'),
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','active');
insert into public.divisions(id,institution_id) values
 ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111'),
 ('22222222-2222-2222-2222-222222222223','11111111-1111-1111-1111-111111111111');
insert into public.students(id,institution_id,student_number) values
 ('44444444-4444-4444-4444-444444444441','11111111-1111-1111-1111-111111111111','SYN-001'),
 ('44444444-4444-4444-4444-444444444442','11111111-1111-1111-1111-111111111111','SYN-002');
insert into public.enrollments(institution_id,student_id,division_id,enrolled_on,status) values
 ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444441','22222222-2222-2222-2222-222222222222',current_date-10,'active'),
 ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444442','22222222-2222-2222-2222-222222222223',current_date-10,'active');
insert into public.roles(id,key) values
 ('55555555-5555-5555-5555-555555555551','institution_admin'),
 ('55555555-5555-5555-5555-555555555552','director');
insert into public.membership_roles values
 ('33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555551');

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
create table public.submissions(
 id uuid primary key default gen_random_uuid(), institution_id uuid not null,
 assignment_id uuid not null references public.assignments(id),
 student_id uuid not null references public.students(id),
 score numeric(7,2), body text, submitted_at timestamptz
);
insert into public.assignments(id,institution_id,max_score,published_at)
values ('66666666-6666-6666-6666-666666666661','11111111-1111-1111-1111-111111111111',10,now());
\i supabase/migrations/20261120045012_validate_submission_scores_against_assignment_maximum.sql

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

-- Mensajería: structural cross-institution and participant membership contracts.
create table public.contract_conversations(
 id uuid primary key,institution_id uuid not null references public.institutions(id),
 unique(id,institution_id)
);
create table public.contract_conversation_members(
 conversation_id uuid not null,institution_id uuid not null,membership_id uuid not null,
 primary key(conversation_id,membership_id),
 foreign key(conversation_id,institution_id) references public.contract_conversations(id,institution_id),
 foreign key(membership_id,institution_id) references public.memberships(id,institution_id)
);
create table public.contract_messages(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null,institution_id uuid not null,
 sender_membership_id uuid not null,body text not null check(length(btrim(body)) between 1 and 5000),
 foreign key(conversation_id,institution_id) references public.contract_conversations(id,institution_id),
 foreign key(sender_membership_id,institution_id) references public.memberships(id,institution_id)
);
