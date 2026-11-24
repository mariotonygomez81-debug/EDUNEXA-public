-- Isolated synthetic schema matching the authorization columns inspected in Hosted.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.roles(id uuid primary key,key text unique not null);
create table public.permissions(id uuid primary key,key text unique not null,description text not null default '');
create table public.role_permissions(role_id uuid not null,permission_id uuid not null,primary key(role_id,permission_id));
create table public.memberships(id uuid primary key,institution_id uuid not null,user_id uuid not null,status text not null);
create table public.membership_roles(membership_id uuid not null,institution_id uuid not null,role_id uuid not null,primary key(membership_id,role_id));
create table public.staff_assignments(id uuid primary key,institution_id uuid not null,membership_id uuid not null,course_subject_id uuid,division_id uuid,assignment_type text not null,starts_on date,ends_on date);
create table public.enrollments(id uuid primary key,institution_id uuid not null,student_id uuid not null,division_id uuid not null,enrolled_on date not null default current_date,ended_on date,status text not null default 'active');
create table public.divisions(id uuid primary key,institution_id uuid not null,course_id uuid not null);
create table public.course_subjects(id uuid primary key,institution_id uuid not null,course_id uuid not null);
create table public.student_memberships(id uuid primary key,institution_id uuid not null,student_id uuid not null,membership_id uuid not null);
create table public.guardians(id uuid primary key,institution_id uuid not null,membership_id uuid not null);
create table public.student_guardians(institution_id uuid not null,student_id uuid not null,guardian_id uuid not null,can_view_grades boolean not null default true,can_view_attendance boolean not null default true,can_view_report_cards boolean not null default false);
create table public.virtual_classrooms(id uuid primary key,institution_id uuid not null,division_id uuid not null,course_subject_id uuid,owner_membership_id uuid,created_by uuid);
create table public.classroom_teacher_permissions(id uuid primary key,institution_id uuid not null,classroom_id uuid not null,teacher_membership_id uuid not null,can_edit_materials boolean not null default false,can_edit_assignments boolean not null default false,can_grade boolean not null default false,can_attendance boolean not null default false,is_active boolean not null default true,granted_by_membership_id uuid not null);
create table public.classroom_members(classroom_id uuid not null,institution_id uuid not null,membership_id uuid not null,member_role text not null);

insert into public.roles values
 ('10000000-0000-0000-0000-000000000001','administrative'),
 ('10000000-0000-0000-0000-000000000002','director'),
 ('10000000-0000-0000-0000-000000000003','guardian'),
 ('10000000-0000-0000-0000-000000000004','institution_admin'),
 ('10000000-0000-0000-0000-000000000005','prefect'),
 ('10000000-0000-0000-0000-000000000006','secretary'),
 ('10000000-0000-0000-0000-000000000007','student'),
 ('10000000-0000-0000-0000-000000000008','teacher');

insert into public.permissions(id,key) values
 ('11000000-0000-0000-0000-000000000001','students.read'),
 ('11000000-0000-0000-0000-000000000002','grades.read'),
 ('11000000-0000-0000-0000-000000000003','grades.manage'),
 ('11000000-0000-0000-0000-000000000004','attendance.read'),
 ('11000000-0000-0000-0000-000000000005','attendance.manage'),
 ('11000000-0000-0000-0000-000000000006','classroom.read'),
 ('11000000-0000-0000-0000-000000000007','classroom.submit'),
 ('11000000-0000-0000-0000-000000000008','classroom.grade'),
 ('11000000-0000-0000-0000-000000000009','classroom.manage'),
 ('11000000-0000-0000-0000-000000000010','institution.read'),
 ('11000000-0000-0000-0000-000000000011','report_cards.publish'),
 ('11000000-0000-0000-0000-000000000012','report_cards.approve'),
 ('11000000-0000-0000-0000-000000000013','students.manage');

-- Relevant permissions reproduced from the Hosted role_permissions matrix.
insert into public.role_permissions
select r.id,p.id from public.roles r cross join public.permissions p
where (r.key='administrative' and p.key in ('students.read','institution.read'))
or (r.key='director' and p.key in ('students.read','grades.read','attendance.read','classroom.read','institution.read','report_cards.approve'))
or (r.key='guardian' and p.key in ('students.read','grades.read','attendance.read','classroom.read','institution.read'))
or (r.key='institution_admin' and p.key in ('students.read','grades.read','grades.manage','attendance.read','attendance.manage','classroom.read','classroom.grade','classroom.manage','institution.read','report_cards.publish','report_cards.approve','students.manage'))
or (r.key='prefect' and p.key in ('students.read','attendance.read','attendance.manage','classroom.read','institution.read'))
or (r.key='secretary' and p.key in ('students.read','students.manage','institution.read'))
or (r.key='student' and p.key in ('students.read','grades.read','attendance.read','classroom.read','classroom.submit','institution.read'))
or (r.key='teacher' and p.key in ('students.read','grades.read','grades.manage','attendance.read','attendance.manage','classroom.read','classroom.grade','classroom.manage','institution.read'));

insert into public.memberships values
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','active'),
 ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','active'),
 ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','active'),
 ('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000004','suspended'),
 ('20000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000005','active');
insert into public.membership_roles values
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008'),
 ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007'),
 ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003'),
 ('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008'),
 ('20000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000008');
-- Multi-role test user has teacher permission role and student contextual role.
insert into public.membership_roles values
 ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008');

insert into public.divisions values
 ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001'),
 ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001');
insert into public.course_subjects values
 ('52000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001');
insert into public.enrollments(id,institution_id,student_id,division_id,status) values
 ('53000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','active'),
 ('53000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','active');
insert into public.staff_assignments values
 ('54000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','teacher',current_date-1,null);
insert into public.student_memberships values
 ('55000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
insert into public.guardians values
 ('56000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003');
insert into public.student_guardians values
 ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001',true,false,false);
insert into public.virtual_classrooms values
 ('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',null,null);
insert into public.classroom_teacher_permissions(id,institution_id,classroom_id,teacher_membership_id,can_edit_materials,can_edit_assignments,can_grade,can_attendance,is_active,granted_by_membership_id) values
 ('58000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true,false,false,true,true,'20000000-0000-0000-0000-000000000003');

create or replace function private.has_institution_permission(p_institution_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.memberships m
 join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
 join public.role_permissions rp on rp.role_id=mr.role_id
 join public.permissions p on p.id=rp.permission_id
 where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id
 and m.status='active' and p.key=p_permission_key)
$$;
