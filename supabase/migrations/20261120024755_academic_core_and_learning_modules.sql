
create table if not exists public.academic_years (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 name text not null,
 starts_on date not null,
 ends_on date not null,
 status text not null default 'planned' check(status in ('planned','active','closed')),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 check(ends_on > starts_on)
);
create table if not exists public.education_levels (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 name text not null,
 code text,
 sort_order int not null default 0,
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 unique(institution_id,code)
);
create table if not exists public.courses (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 level_id uuid not null,
 name text not null,
 grade_number int,
 shift text check(shift in ('morning','afternoon','evening','full_day','other')),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(level_id,institution_id) references public.education_levels(id,institution_id)
);
create table if not exists public.divisions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 course_id uuid not null,
 campus_id uuid,
 academic_year_id uuid not null,
 name text not null,
 capacity int check(capacity is null or capacity > 0),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(course_id,institution_id) references public.courses(id,institution_id),
 foreign key(campus_id,institution_id) references public.campuses(id,institution_id),
 foreign key(academic_year_id,institution_id) references public.academic_years(id,institution_id)
);
create table if not exists public.subjects (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 name text not null,
 code text,
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 unique(institution_id,code)
);
create table if not exists public.course_subjects (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 course_id uuid not null,
 subject_id uuid not null,
 weekly_hours numeric(4,1),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 unique(institution_id,course_id,subject_id),
 foreign key(course_id,institution_id) references public.courses(id,institution_id),
 foreign key(subject_id,institution_id) references public.subjects(id,institution_id)
);
create table if not exists public.staff_assignments (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 membership_id uuid not null,
 course_subject_id uuid,
 division_id uuid,
 assignment_type text not null check(assignment_type in ('teacher','prefect','director','administrative')),
 starts_on date,
 ends_on date,
 created_at timestamptz not null default now(),
 foreign key(membership_id,institution_id) references public.memberships(id,institution_id),
 foreign key(course_subject_id,institution_id) references public.course_subjects(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id)
);
create table if not exists public.students (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 student_number text,
 first_name text not null,
 last_name text not null,
 birth_date date,
 national_id_encrypted text,
 email text,
 status text not null default 'active' check(status in ('active','inactive','graduated','withdrawn')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,institution_id),
 unique(institution_id,student_number)
);
create table if not exists public.guardians (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 membership_id uuid not null,
 relationship_label text,
 receives_notifications boolean not null default true,
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 unique(institution_id,membership_id),
 foreign key(membership_id,institution_id) references public.memberships(id,institution_id)
);
create table if not exists public.student_guardians (
 institution_id uuid not null references public.institutions(id) on delete cascade,
 student_id uuid not null,
 guardian_id uuid not null,
 is_primary boolean not null default false,
 can_view_grades boolean not null default true,
 can_view_attendance boolean not null default true,
 can_authorize boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(student_id,guardian_id),
 foreign key(student_id,institution_id) references public.students(id,institution_id),
 foreign key(guardian_id,institution_id) references public.guardians(id,institution_id)
);
create table if not exists public.enrollments (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 student_id uuid not null,
 division_id uuid not null,
 enrolled_on date not null default current_date,
 ended_on date,
 status text not null default 'active' check(status in ('active','transferred','withdrawn','completed')),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(student_id,institution_id) references public.students(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id)
);
create table if not exists public.attendance_sessions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 division_id uuid not null,
 held_on date not null,
 period_label text,
 created_by uuid references auth.users(id),
 status text not null default 'open' check(status in ('open','submitted','locked')),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id),
 unique(institution_id,division_id,held_on,period_label)
);
create table if not exists public.attendance_records (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 session_id uuid not null,
 student_id uuid not null,
 status text not null check(status in ('present','absent','late','justified','early_departure')),
 note text,
 recorded_by uuid references auth.users(id),
 recorded_at timestamptz not null default now(),
 unique(institution_id,session_id,student_id),
 foreign key(session_id,institution_id) references public.attendance_sessions(id,institution_id),
 foreign key(student_id,institution_id) references public.students(id,institution_id)
);
create table if not exists public.grading_periods (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 academic_year_id uuid not null,
 name text not null,
 starts_on date not null,
 ends_on date not null,
 sort_order int not null default 0,
 unique(id,institution_id),
 foreign key(academic_year_id,institution_id) references public.academic_years(id,institution_id),
 check(ends_on >= starts_on)
);
create table if not exists public.assessments (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 course_subject_id uuid not null,
 division_id uuid not null,
 grading_period_id uuid not null,
 title text not null,
 assessment_date date,
 max_score numeric(7,2) not null default 10 check(max_score > 0),
 description text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(course_subject_id,institution_id) references public.course_subjects(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id),
 foreign key(grading_period_id,institution_id) references public.grading_periods(id,institution_id)
);
create table if not exists public.grade_records (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 assessment_id uuid not null,
 student_id uuid not null,
 score numeric(7,2),
 comment text,
 entered_by uuid references auth.users(id),
 entered_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(institution_id,assessment_id,student_id),
 foreign key(assessment_id,institution_id) references public.assessments(id,institution_id),
 foreign key(student_id,institution_id) references public.students(id,institution_id)
);
create table if not exists public.virtual_classrooms (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 division_id uuid not null,
 course_subject_id uuid,
 title text not null,
 description text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id),
 foreign key(course_subject_id,institution_id) references public.course_subjects(id,institution_id)
);
create table if not exists public.classroom_members (
 classroom_id uuid not null,
 institution_id uuid not null,
 membership_id uuid not null,
 member_role text not null check(member_role in ('teacher','student','guardian')),
 joined_at timestamptz not null default now(),
 primary key(classroom_id,membership_id),
 foreign key(classroom_id,institution_id) references public.virtual_classrooms(id,institution_id),
 foreign key(membership_id,institution_id) references public.memberships(id,institution_id)
);
create table if not exists public.classroom_materials (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 classroom_id uuid not null,
 title text not null,
 body text,
 file_path text,
 published_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(classroom_id,institution_id) references public.virtual_classrooms(id,institution_id)
);
create table if not exists public.assignments (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 classroom_id uuid not null,
 title text not null,
 instructions text,
 due_at timestamptz,
 max_score numeric(7,2),
 published_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(classroom_id,institution_id) references public.virtual_classrooms(id,institution_id)
);
create table if not exists public.submissions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 assignment_id uuid not null,
 student_id uuid not null,
 body text,
 file_path text,
 submitted_at timestamptz,
 score numeric(7,2),
 feedback text,
 graded_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 unique(institution_id,assignment_id,student_id),
 foreign key(assignment_id,institution_id) references public.assignments(id,institution_id),
 foreign key(student_id,institution_id) references public.students(id,institution_id)
);
create table if not exists public.announcements (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 title text not null,
 body text not null,
 audience text not null default 'institution' check(audience in ('institution','staff','families','students','course')),
 division_id uuid,
 published_at timestamptz,
 expires_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,institution_id),
 foreign key(division_id,institution_id) references public.divisions(id,institution_id)
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 subject text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,institution_id)
);
create table if not exists public.conversation_members (
 conversation_id uuid not null,
 institution_id uuid not null,
 membership_id uuid not null,
 joined_at timestamptz not null default now(),
 primary key(conversation_id,membership_id),
 foreign key(conversation_id,institution_id) references public.conversations(id,institution_id),
 foreign key(membership_id,institution_id) references public.memberships(id,institution_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 conversation_id uuid not null,
 sender_membership_id uuid not null,
 body text not null,
 sent_at timestamptz not null default now(),
 read_at timestamptz,
 foreign key(conversation_id,institution_id) references public.conversations(id,institution_id),
 foreign key(sender_membership_id,institution_id) references public.memberships(id,institution_id)
);
create table if not exists public.audit_logs (
 id bigint generated always as identity primary key,
 institution_id uuid references public.institutions(id) on delete set null,
 actor_user_id uuid references auth.users(id) on delete set null,
 action text not null,
 entity_type text not null,
 entity_id text,
 metadata jsonb not null default '{}'::jsonb,
 ip_address inet,
 created_at timestamptz not null default now()
);
create table if not exists public.subscription_plans (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name text not null,
 description text,
 monthly_price numeric(10,2) not null default 0 check(monthly_price >= 0),
 currency char(3) not null default 'USD',
 max_students int,
 max_staff int,
 features jsonb not null default '{}'::jsonb,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 plan_id uuid not null references public.subscription_plans(id),
 status text not null default 'trial' check(status in ('trial','active','past_due','cancelled','suspended')),
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 external_customer_id text,
 external_subscription_id text,
 created_at timestamptz not null default now(),
 unique(id,institution_id)
);
create table if not exists public.public_site_pages (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id) on delete cascade,
 slug text not null,
 title text not null,
 content jsonb not null default '{}'::jsonb,
 is_published boolean not null default false,
 updated_at timestamptz not null default now(),
 unique(institution_id,slug),
 unique(id,institution_id)
);

create index if not exists academic_years_inst_idx on public.academic_years(institution_id);
create index if not exists courses_inst_level_idx on public.courses(institution_id,level_id);
create index if not exists divisions_inst_year_idx on public.divisions(institution_id,academic_year_id);
create index if not exists staff_assignments_member_idx on public.staff_assignments(institution_id,membership_id);
create index if not exists students_inst_status_idx on public.students(institution_id,status);
create index if not exists enrollments_student_idx on public.enrollments(institution_id,student_id,status);
create index if not exists attendance_sessions_date_idx on public.attendance_sessions(institution_id,held_on);
create index if not exists attendance_records_student_idx on public.attendance_records(institution_id,student_id);
create index if not exists assessments_division_idx on public.assessments(institution_id,division_id,assessment_date);
create index if not exists grade_records_student_idx on public.grade_records(institution_id,student_id);
create index if not exists classrooms_division_idx on public.virtual_classrooms(institution_id,division_id);
create index if not exists messages_conversation_idx on public.messages(institution_id,conversation_id,sent_at);

alter table public.academic_years enable row level security;
alter table public.education_levels enable row level security;
alter table public.courses enable row level security;
alter table public.divisions enable row level security;
alter table public.subjects enable row level security;
alter table public.course_subjects enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.enrollments enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.grading_periods enable row level security;
alter table public.assessments enable row level security;
alter table public.grade_records enable row level security;
alter table public.virtual_classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_materials enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.announcements enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.audit_logs enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.public_site_pages enable row level security;

do $$
declare t text;
begin
 foreach t in array array['academic_years','education_levels','courses','divisions','subjects','course_subjects','grading_periods','virtual_classrooms','announcements'] loop
  execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
  execute format(
   'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.memberships m where m.institution_id = %I.institution_id and m.user_id = (select auth.uid()) and m.status = ''active''))',
   t || '_member_read', t, t
  );
 end loop;
end $$;

revoke all on all tables in schema public from anon;
grant select on public.academic_years, public.education_levels, public.courses, public.divisions,
 public.subjects, public.course_subjects, public.grading_periods, public.virtual_classrooms,
 public.announcements to authenticated;
grant select, insert, update on public.profiles to authenticated;
