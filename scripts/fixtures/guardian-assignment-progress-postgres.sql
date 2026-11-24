-- Synthetic PostgreSQL fixture for guardian-assignment-progress.draft.sql.
-- No real school, student, guardian, or production data is used.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create schema private;

create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

create table public.roles (
  id uuid primary key,
  key text not null unique
);
create table public.memberships (
  id uuid primary key,
  institution_id uuid not null,
  user_id uuid not null,
  status text not null
);
create table public.membership_roles (
  membership_id uuid not null,
  institution_id uuid not null,
  role_id uuid not null,
  primary key (membership_id, role_id)
);
create table public.guardians (
  id uuid primary key,
  institution_id uuid not null,
  membership_id uuid not null
);
create table public.student_guardians (
  institution_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  can_view_grades boolean not null default false,
  primary key (student_id, guardian_id)
);
create table public.enrollments (
  institution_id uuid not null,
  student_id uuid not null,
  division_id uuid not null,
  enrolled_on date not null default current_date,
  ended_on date,
  status text not null
);
create table public.virtual_classrooms (
  id uuid primary key,
  institution_id uuid not null,
  division_id uuid not null,
  course_subject_id uuid,
  title text not null
);
create table public.assignments (
  id uuid primary key,
  institution_id uuid not null,
  classroom_id uuid not null,
  title text not null,
  due_at timestamptz,
  max_score numeric(7,2),
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.course_subjects (
  id uuid primary key,
  institution_id uuid not null,
  subject_id uuid not null
);
create table public.subjects (
  id uuid primary key,
  institution_id uuid not null,
  name text not null
);
create table public.submissions (
  id uuid primary key,
  institution_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  body text,
  file_path text,
  submitted_at timestamptz,
  score numeric(7,2),
  feedback text,
  review_status text
);

create or replace function private.has_institution_permission(
  p_institution_id uuid,
  p_permission_key text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_permission_key in ('classroom.read', 'grades.read')
    and exists (
      select 1
      from public.memberships m
      join public.membership_roles mr
        on mr.membership_id = m.id
       and mr.institution_id = m.institution_id
      join public.roles r on r.id = mr.role_id
      where m.user_id = (select auth.uid())
        and m.institution_id = p_institution_id
        and m.status = 'active'
        and r.key = 'guardian'
    );
$function$;

create or replace function private.can_access_student(
  p_student_id uuid,
  p_institution_id uuid,
  p_permission_key text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.institution_id = m.institution_id
    join public.roles r on r.id = mr.role_id
    join public.guardians g
      on g.membership_id = m.id
     and g.institution_id = m.institution_id
    join public.student_guardians sg
      on sg.guardian_id = g.id
     and sg.institution_id = g.institution_id
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.status = 'active'
      and r.key = 'guardian'
      and sg.student_id = p_student_id
      and p_permission_key = 'grades.read'
      and sg.can_view_grades
      and private.has_institution_permission(p_institution_id, p_permission_key)
  );
$function$;

insert into public.roles (id, key) values
  ('10000000-0000-0000-0000-000000000001', 'guardian'),
  ('10000000-0000-0000-0000-000000000002', 'student');

insert into public.memberships (id, institution_id, user_id, status) values
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','active'),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','active'),
  ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','inactive');

insert into public.membership_roles (membership_id,institution_id,role_id) values
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');

insert into public.guardians (id,institution_id,membership_id) values
  ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003');

insert into public.student_guardians (institution_id,student_id,guardian_id,can_view_grades) values
  ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',true),
  ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002',false),
  ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001',true),
  ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003',true);

insert into public.enrollments (institution_id,student_id,division_id,status) values
  ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','active'),
  ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','active'),
  ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','withdrawn');

insert into public.subjects (id,institution_id,name) values
  ('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Matemática');
insert into public.course_subjects (id,institution_id,subject_id) values
  ('90000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001');
insert into public.virtual_classrooms (id,institution_id,division_id,course_subject_id,title) values
  ('a0000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Matemática · 1° A');

insert into public.assignments (id,institution_id,classroom_id,title,due_at,max_score,published_at) values
  ('b0000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Ecuaciones',now()+interval '2 days',10,now()-interval '1 day'),
  ('b0000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Actividad futura',now()+interval '2 days',10,now()+interval '2 days'),
  ('b0000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Trabajo de geometría',now()+interval '3 days',10,now()-interval '1 day');

insert into public.submissions (id,institution_id,assignment_id,student_id,body,file_path,submitted_at,score,feedback,review_status) values
  ('c0000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','CONTENIDO PRIVADO','private/path/1',now()-interval '3 hours',8,'DEVOLUCIÓN PRIVADA','aprobado'),
  ('c0000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','OTRO CONTENIDO PRIVADO','private/path/2',now()-interval '2 hours',6,'OTRA DEVOLUCIÓN','visto');

grant usage on schema public, private, auth to authenticated;
grant execute on function auth.uid() to authenticated;
