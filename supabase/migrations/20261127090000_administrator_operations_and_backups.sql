-- Institutional administration: profile, orientations, controlled bulk enrollment and academic-year backups.
create table if not exists public.education_orientations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  education_level_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 100),
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint education_orientations_id_institution_unique unique(id,institution_id),
  constraint education_orientations_level_fk
    foreign key (education_level_id,institution_id)
    references public.education_levels(id,institution_id) on delete restrict,
  constraint education_orientations_scope_code_unique unique(institution_id,education_level_id,code)
);
create index if not exists education_orientations_level_idx
  on public.education_orientations(institution_id,education_level_id,is_active);
alter table public.education_orientations enable row level security;
revoke all on public.education_orientations from public,anon,authenticated;
grant select on public.education_orientations to authenticated;
create policy education_orientations_admin_read on public.education_orientations
for select to authenticated
using (private.has_institution_permission(institution_id,'institution.manage'));

alter table public.courses add column if not exists orientation_id uuid;
alter table public.courses
  drop constraint if exists courses_orientation_scope_fk;
alter table public.courses
  add constraint courses_orientation_scope_fk
  foreign key (orientation_id,institution_id)
  references public.education_orientations(id,institution_id) on delete restrict;

create or replace function private.validate_course_orientation()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.orientation_id is not null and not exists (
    select 1 from public.education_orientations o
    where o.id=new.orientation_id and o.institution_id=new.institution_id
      and o.education_level_id=new.level_id and o.is_active
  ) then
    raise exception 'La orientación no pertenece al nivel seleccionado o está inactiva' using errcode='23503';
  end if;
  return new;
end;
$$;
drop trigger if exists courses_validate_orientation on public.courses;
create trigger courses_validate_orientation
before insert or update of orientation_id,level_id,institution_id on public.courses
for each row execute function private.validate_course_orientation();

create or replace function private.update_institution_profile_impl(
  p_institution_id uuid,p_display_name text,p_legal_name text,p_tax_id text,
  p_contact_email text,p_contact_phone text,p_address_line text,p_city text,
  p_province text,p_country text,p_website_url text,p_timezone text,p_locale text,
  p_expected_updated_at timestamptz
) returns timestamptz
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_updated timestamptz;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_display_name,''))) not between 2 and 160
    or length(btrim(coalesce(p_legal_name,''))) not between 2 and 200
    or (p_contact_email is not null and p_contact_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
    or (p_website_url is not null and p_website_url !~* '^https?://')
    or length(coalesce(p_contact_phone,''))>40
    or length(coalesce(p_address_line,''))>250
    or length(coalesce(p_city,''))>100 or length(coalesce(p_province,''))>100
    or length(coalesce(p_country,''))>80
    or p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$'
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'Invalid institutional profile' using errcode='22023';
  end if;
  update public.institutions set
    display_name=btrim(p_display_name),legal_name=btrim(p_legal_name),
    tax_id=nullif(btrim(coalesce(p_tax_id,'')),''),
    contact_email=nullif(btrim(coalesce(p_contact_email,'')),''),
    contact_phone=nullif(btrim(coalesce(p_contact_phone,'')),''),
    address_line=nullif(btrim(coalesce(p_address_line,'')),''),
    city=nullif(btrim(coalesce(p_city,'')),''),
    province=nullif(btrim(coalesce(p_province,'')),''),
    country=coalesce(nullif(btrim(p_country),''),'Argentina'),
    website_url=nullif(btrim(coalesce(p_website_url,'')),''),
    timezone=p_timezone,locale=p_locale,updated_at=now()
  where id=p_institution_id and updated_at=p_expected_updated_at
  returning updated_at into v_updated;
  if v_updated is null then raise exception 'Institution profile changed; reload before saving' using errcode='40001'; end if;
  insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_institution_id,v_user,'institution.profile.updated','institution',p_institution_id::text,
    jsonb_build_object('updated_at',v_updated));
  return v_updated;
end;
$$;
revoke all on function private.update_institution_profile_impl(uuid,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz) from public,anon;
grant execute on function private.update_institution_profile_impl(uuid,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz) to authenticated;
create or replace function public.update_institution_profile(
  p_institution_id uuid,p_display_name text,p_legal_name text,p_tax_id text,
  p_contact_email text,p_contact_phone text,p_address_line text,p_city text,
  p_province text,p_country text,p_website_url text,p_timezone text,p_locale text,
  p_expected_updated_at timestamptz
) returns timestamptz language sql set search_path=''
as $$ select private.update_institution_profile_impl($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14); $$;
revoke all on function public.update_institution_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.update_institution_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz) to authenticated;

create or replace function private.save_education_orientation_impl(
  p_institution_id uuid,p_education_level_id uuid,p_orientation_id uuid,p_name text,p_code text,p_is_active boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_user uuid:=(select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100
    or length(coalesce(p_code,''))>20
    or not exists(select 1 from public.education_levels l where l.id=p_education_level_id and l.institution_id=p_institution_id) then
    raise exception 'Invalid education orientation' using errcode='22023';
  end if;
  if p_orientation_id is null then
    insert into public.education_orientations(institution_id,education_level_id,name,code,is_active)
    values(p_institution_id,p_education_level_id,btrim(p_name),nullif(upper(btrim(coalesce(p_code,''))),''),coalesce(p_is_active,true))
    returning id into v_id;
  else
    update public.education_orientations set education_level_id=p_education_level_id,
      name=btrim(p_name),code=nullif(upper(btrim(coalesce(p_code,''))),''),is_active=coalesce(p_is_active,true),updated_at=now()
    where id=p_orientation_id and institution_id=p_institution_id returning id into v_id;
    if v_id is null then raise exception 'Orientation not found' using errcode='P0002'; end if;
  end if;
  insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_institution_id,v_user,case when p_orientation_id is null then 'education.orientation.created' else 'education.orientation.updated' end,
    'education_orientation',v_id::text,jsonb_build_object('education_level_id',p_education_level_id,'name',p_name,'is_active',p_is_active));
  return v_id;
end;
$$;
revoke all on function private.save_education_orientation_impl(uuid,uuid,uuid,text,text,boolean) from public,anon;
grant execute on function private.save_education_orientation_impl(uuid,uuid,uuid,text,text,boolean) to authenticated;
create or replace function public.save_education_orientation(
  p_institution_id uuid,p_education_level_id uuid,p_orientation_id uuid default null,
  p_name text default null,p_code text default null,p_is_active boolean default true
) returns uuid language sql set search_path=''
as $$ select private.save_education_orientation_impl($1,$2,$3,$4,$5,$6); $$;
revoke all on function public.save_education_orientation(uuid,uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.save_education_orientation(uuid,uuid,uuid,text,text,boolean) to authenticated;

create or replace function private.delete_education_orientation_impl(p_institution_id uuid,p_orientation_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'institution.manage') then
    raise exception 'Institution administration permission required' using errcode='42501';
  end if;
  if exists(select 1 from public.courses c where c.institution_id=p_institution_id and c.orientation_id=p_orientation_id) then
    raise exception 'Orientation is assigned to courses; deactivate it instead' using errcode='23503';
  end if;
  delete from public.education_orientations where id=p_orientation_id and institution_id=p_institution_id;
  if not found then raise exception 'Orientation not found' using errcode='P0002'; end if;
  insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_institution_id,v_user,'education.orientation.deleted','education_orientation',p_orientation_id::text,'{}'::jsonb);
end;
$$;
revoke all on function private.delete_education_orientation_impl(uuid,uuid) from public,anon;
grant execute on function private.delete_education_orientation_impl(uuid,uuid) to authenticated;
create or replace function public.delete_education_orientation(p_institution_id uuid,p_orientation_id uuid)
returns void language sql set search_path=''
as $$ select private.delete_education_orientation_impl($1,$2); $$;
revoke all on function public.delete_education_orientation(uuid,uuid) from public,anon;
grant execute on function public.delete_education_orientation(uuid,uuid) to authenticated;

create or replace function private.import_students_to_division_impl(
  p_institution_id uuid,p_academic_year_id uuid,p_division_id uuid,p_rows jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_membership uuid; v_row jsonb; v_student_id uuid;
  v_count integer:=0; v_errors jsonb:='[]'::jsonb; v_number text; v_first text; v_last text;
  v_birth date; v_email text; v_reason text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id into v_membership from public.memberships m
  where m.user_id=v_user and m.institution_id=p_institution_id and m.status='active' limit 1;
  if v_membership is null or not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'Import must contain between 1 and 500 students' using errcode='22023';
  end if;
  if not exists(select 1 from public.divisions d join public.academic_years ay on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
    where d.id=p_division_id and d.institution_id=p_institution_id and ay.id=p_academic_year_id and ay.status<>'closed') then
    raise exception 'Selected division does not belong to the selected academic year' using errcode='23503';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_number:=nullif(btrim(coalesce(v_row->>'student_number','')),'');
    v_first:=btrim(coalesce(v_row->>'first_name',''));
    v_last:=btrim(coalesce(v_row->>'last_name',''));
    v_birth:=nullif(v_row->>'birth_date','')::date;
    v_email:=nullif(lower(btrim(coalesce(v_row->>'email',''))),'');
    if length(v_first) not between 2 and 100 or length(v_last) not between 2 and 100
      or v_number is null or length(v_number)>40
      or (v_email is not null and (length(v_email)>254 or v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'))
      or (v_row->>'birth_date' is not null and v_row->>'birth_date'<>'' and v_birth is null) then
      raise exception 'Invalid student row: required name, surname, enrollment number and valid date/email' using errcode='22023';
    end if;
    if exists(select 1 from public.students s where s.institution_id=p_institution_id and s.student_number=v_number) then
      raise exception 'Student number already exists: %',v_number using errcode='23505';
    end if;
    insert into public.students(institution_id,student_number,first_name,last_name,birth_date,email,status)
    values(p_institution_id,v_number,v_first,v_last,v_birth,v_email,'active')
    returning id into v_student_id;
    perform private.create_student_enrollment_impl(p_institution_id,v_student_id,p_division_id,current_date,'Matrícula masiva desde importación EDUNEXA');
    v_count:=v_count+1;
  end loop;
  insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_institution_id,v_user,'students.bulk_imported','academic_division',p_division_id::text,
    jsonb_build_object('academic_year_id',p_academic_year_id,'imported_count',v_count));
  return jsonb_build_object('imported',v_count,'division_id',p_division_id,'academic_year_id',p_academic_year_id);
end;
$$;
revoke all on function private.import_students_to_division_impl(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function private.import_students_to_division_impl(uuid,uuid,uuid,jsonb) to authenticated;
create or replace function public.import_students_to_division(p_institution_id uuid,p_academic_year_id uuid,p_division_id uuid,p_rows jsonb)
returns jsonb language sql set search_path=''
as $$ select private.import_students_to_division_impl($1,$2,$3,$4); $$;
revoke all on function public.import_students_to_division(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.import_students_to_division(uuid,uuid,uuid,jsonb) to authenticated;


create or replace function private.create_course_with_orientation_impl(
 p_institution_id uuid,p_level_id uuid,p_name text,p_grade_number integer,p_shift text,p_orientation_id uuid
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_course_id uuid;
begin
 if p_orientation_id is not null and not exists(
  select 1 from public.education_orientations o where o.id=p_orientation_id
   and o.institution_id=p_institution_id and o.education_level_id=p_level_id and o.is_active
 ) then raise exception 'Orientation does not belong to selected level' using errcode='23503'; end if;
 v_course_id:=private.create_course_impl(p_institution_id,p_level_id,p_name,p_grade_number,p_shift);
 if p_orientation_id is not null then
  update public.courses set orientation_id=p_orientation_id where id=v_course_id and institution_id=p_institution_id;
 end if;
 return v_course_id;
end;
$function$;
revoke all on function private.create_course_with_orientation_impl(uuid,uuid,text,integer,text,uuid) from public,anon;
grant execute on function private.create_course_with_orientation_impl(uuid,uuid,text,integer,text,uuid) to authenticated;
create or replace function public.create_course_with_orientation(
 p_institution_id uuid,p_level_id uuid,p_name text,p_grade_number integer default null,
 p_shift text default null,p_orientation_id uuid default null
 ) returns uuid language sql set search_path=''
as $function$ select private.create_course_with_orientation_impl($1,$2,$3,$4,$5,$6); $function$;
revoke all on function public.create_course_with_orientation(uuid,uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.create_course_with_orientation(uuid,uuid,text,integer,text,uuid) to authenticated;

create table if not exists public.institution_academic_backups (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  academic_year_id uuid not null,
  created_by uuid not null references auth.users(id),
  format text not null default 'EDUNEXA_ACADEMIC_BACKUP',
  schema_version integer not null default 1,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint institution_academic_backups_year_fk
    foreign key (academic_year_id,institution_id) references public.academic_years(id,institution_id) on delete restrict
);
alter table public.institution_academic_backups enable row level security;
revoke all on public.institution_academic_backups from public,anon,authenticated;
create index if not exists institution_academic_backups_history_idx
  on public.institution_academic_backups(institution_id,academic_year_id,created_at desc);

create or replace function private.academic_year_snapshot(p_institution_id uuid,p_year_id uuid)
returns jsonb language sql security definer set search_path=''
as $$
select jsonb_build_object(
 'format','EDUNEXA_ACADEMIC_BACKUP','schema_version',1,'institution_id',p_institution_id,
 'academic_year_id',p_year_id,'created_at',now(),
 'tables',jsonb_build_object(
  'academic_years',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.academic_years x where x.institution_id=p_institution_id and x.id=p_year_id),
  'campuses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campuses x where x.institution_id=p_institution_id and x.id in (select campus_id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id and campus_id is not null)),
  'education_levels',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.education_levels x where x.institution_id=p_institution_id and x.id in (select c.level_id from public.courses c join public.divisions d on d.course_id=c.id and d.institution_id=c.institution_id where d.institution_id=p_institution_id and d.academic_year_id=p_year_id)),
  'courses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.courses x where x.institution_id=p_institution_id and x.id in (select course_id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'education_orientations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.education_orientations x where x.institution_id=p_institution_id and x.education_level_id in (select c.level_id from public.courses c join public.divisions d on d.course_id=c.id and d.institution_id=c.institution_id where d.institution_id=p_institution_id and d.academic_year_id=p_year_id)),
  'subjects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.subjects x where x.institution_id=p_institution_id and x.id in (select cs.subject_id from public.course_subjects cs where cs.institution_id=p_institution_id and cs.course_id in (select course_id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id))),
  'course_subjects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.course_subjects x where x.institution_id=p_institution_id and x.course_id in (select course_id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'divisions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.divisions x where x.institution_id=p_institution_id and x.academic_year_id=p_year_id),
  'students',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.students x where x.institution_id=p_institution_id and x.id in (select e.student_id from public.enrollments e join public.divisions d on d.id=e.division_id and d.institution_id=e.institution_id where e.institution_id=p_institution_id and d.academic_year_id=p_year_id)),
  'enrollments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.enrollments x where x.institution_id=p_institution_id and x.division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'enrollment_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.enrollment_events x where x.institution_id=p_institution_id and x.enrollment_id in (select e.id from public.enrollments e join public.divisions d on d.id=e.division_id and d.institution_id=e.institution_id where e.institution_id=p_institution_id and d.academic_year_id=p_year_id)),
  'grading_periods',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.grading_periods x where x.institution_id=p_institution_id and x.academic_year_id=p_year_id),
  'grading_period_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.grading_period_events x where x.institution_id=p_institution_id and x.grading_period_id in (select id from public.grading_periods where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'attendance_sessions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.attendance_sessions x where x.institution_id=p_institution_id and x.division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'attendance_records',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.attendance_records x where x.institution_id=p_institution_id and x.session_id in (select id from public.attendance_sessions where institution_id=p_institution_id and division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id))),
  'classroom_attendance_sessions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.classroom_attendance_sessions x where x.institution_id=p_institution_id and x.division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'classroom_attendance_records',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.classroom_attendance_records x where x.institution_id=p_institution_id and x.session_id in (select id from public.classroom_attendance_sessions where institution_id=p_institution_id and division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id))),
  'assessments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.assessments x where x.institution_id=p_institution_id and (x.division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id) or x.grading_period_id in (select id from public.grading_periods where institution_id=p_institution_id and academic_year_id=p_year_id))),
  'grade_records',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.grade_records x where x.institution_id=p_institution_id and x.assessment_id in (select id from public.assessments where institution_id=p_institution_id and (division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id) or grading_period_id in (select id from public.grading_periods where institution_id=p_institution_id and academic_year_id=p_year_id)))),
  'grade_record_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.grade_record_events x where x.institution_id=p_institution_id and x.assessment_id in (select id from public.assessments where institution_id=p_institution_id and (division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id) or grading_period_id in (select id from public.grading_periods where institution_id=p_institution_id and academic_year_id=p_year_id)))),
  'report_card_workflows',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.report_card_workflows x where x.institution_id=p_institution_id and x.grading_period_id in (select id from public.grading_periods where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'report_card_snapshots',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.report_card_snapshots x where x.institution_id=p_institution_id and x.grading_period_id in (select id from public.grading_periods where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'virtual_classrooms',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.virtual_classrooms x where x.institution_id=p_institution_id and x.division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'assignments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.assignments x where x.institution_id=p_institution_id and x.classroom_id in (select id from public.virtual_classrooms where institution_id=p_institution_id and division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id))),
  'submissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.submissions x where x.institution_id=p_institution_id and x.assignment_id in (select id from public.assignments where institution_id=p_institution_id and classroom_id in (select id from public.virtual_classrooms where institution_id=p_institution_id and division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)))),
  'teacher_guardian_appointments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.teacher_guardian_appointments x where x.institution_id=p_institution_id and x.division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)),
  'teacher_guardian_appointment_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.teacher_guardian_appointment_events x where x.institution_id=p_institution_id and x.appointment_id in (select id from public.teacher_guardian_appointments where institution_id=p_institution_id and division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id))),
  'teacher_guardian_appointment_commitments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.teacher_guardian_appointment_commitments x where x.institution_id=p_institution_id and x.appointment_id in (select id from public.teacher_guardian_appointments where institution_id=p_institution_id and division_id in (select id from public.divisions where institution_id=p_institution_id and academic_year_id=p_year_id)))
 )
);
$$;
revoke all on function private.academic_year_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function private.academic_year_snapshot(uuid,uuid) from public,anon,authenticated;

create or replace function private.create_academic_year_backup_impl(p_institution_id uuid,p_academic_year_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_snapshot jsonb;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and institution_id=p_institution_id) then raise exception 'Academic year not found' using errcode='P0002'; end if;
 v_snapshot:=private.academic_year_snapshot(p_institution_id,p_academic_year_id);
 insert into public.institution_academic_backups(institution_id,academic_year_id,created_by,snapshot)
 values(p_institution_id,p_academic_year_id,v_user,v_snapshot) returning id into v_id;
 insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_institution_id,v_user,'academic_year.backup.created','academic_year_backup',v_id::text,
   jsonb_build_object('academic_year_id',p_academic_year_id,'schema_version',1));
 return v_id;
end;
$$;
revoke all on function private.create_academic_year_backup_impl(uuid,uuid) from public,anon;
grant execute on function private.create_academic_year_backup_impl(uuid,uuid) to authenticated;
create or replace function public.create_academic_year_backup(p_institution_id uuid,p_academic_year_id uuid)
returns uuid language sql set search_path=''
as $$ select private.create_academic_year_backup_impl($1,$2); $$;
revoke all on function public.create_academic_year_backup(uuid,uuid) from public,anon;
grant execute on function public.create_academic_year_backup(uuid,uuid) to authenticated;

create or replace function private.get_academic_year_backup_impl(p_institution_id uuid,p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_snapshot jsonb;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 select snapshot into v_snapshot from public.institution_academic_backups where id=p_backup_id and institution_id=p_institution_id;
 if v_snapshot is null then raise exception 'Backup not found' using errcode='P0002'; end if;
 return v_snapshot;
end;
$$;
revoke all on function private.get_academic_year_backup_impl(uuid,uuid) from public,anon;
grant execute on function private.get_academic_year_backup_impl(uuid,uuid) to authenticated;
create or replace function public.get_academic_year_backup(p_institution_id uuid,p_backup_id uuid)
returns jsonb language sql set search_path=''
as $$ select private.get_academic_year_backup_impl($1,$2); $$;
revoke all on function public.get_academic_year_backup(uuid,uuid) from public,anon;
grant execute on function public.get_academic_year_backup(uuid,uuid) to authenticated;

create or replace function private.list_academic_year_backups_impl(p_institution_id uuid,p_academic_year_id uuid)
returns table(id uuid,created_at timestamptz,schema_version integer,created_by uuid)
language plpgsql security definer set search_path=''
as $$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 return query select b.id,b.created_at,b.schema_version,b.created_by from public.institution_academic_backups b
 where b.institution_id=p_institution_id and b.academic_year_id=p_academic_year_id order by b.created_at desc limit 50;
end;
$$;
revoke all on function private.list_academic_year_backups_impl(uuid,uuid) from public,anon;
grant execute on function private.list_academic_year_backups_impl(uuid,uuid) to authenticated;
create or replace function public.list_academic_year_backups(p_institution_id uuid,p_academic_year_id uuid)
returns table(id uuid,created_at timestamptz,schema_version integer,created_by uuid)
language sql stable set search_path=''
as $$ select * from private.list_academic_year_backups_impl($1,$2); $$;
revoke all on function public.list_academic_year_backups(uuid,uuid) from public,anon;
grant execute on function public.list_academic_year_backups(uuid,uuid) to authenticated;

create or replace function private.restore_academic_year_backup_impl(p_institution_id uuid,p_academic_year_id uuid,p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_snapshot jsonb; v_table text; v_restored integer:=0; v_tables text[]:=array[
 'academic_years','campuses','education_levels','education_orientations','courses','subjects','course_subjects','divisions',
 'students','enrollments','enrollment_events','grading_periods','grading_period_events',
 'attendance_sessions','attendance_records','classroom_attendance_sessions','classroom_attendance_records',
 'assessments','grade_records','grade_record_events','report_card_workflows','report_card_snapshots',
 'virtual_classrooms','assignments','submissions','teacher_guardian_appointments',
 'teacher_guardian_appointment_events','teacher_guardian_appointment_commitments'
];
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 select snapshot into v_snapshot from public.institution_academic_backups
 where id=p_backup_id and institution_id=p_institution_id and academic_year_id=p_academic_year_id;
 if v_snapshot is null then raise exception 'Backup not found for this institution and academic year' using errcode='P0002'; end if;
 if v_snapshot->>'format'<>'EDUNEXA_ACADEMIC_BACKUP' or (v_snapshot->>'schema_version')::integer not in (1) or v_snapshot->>'institution_id'<>p_institution_id::text or v_snapshot->>'academic_year_id'<>p_academic_year_id::text then
  raise exception 'Backup format, institution or academic year does not match' using errcode='22023';
 end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and institution_id=p_institution_id) then raise exception 'Target academic year must exist before restoration' using errcode='23503'; end if;
 foreach v_table in array v_tables loop
  if jsonb_typeof(v_snapshot->'tables'->v_table)='array' and jsonb_array_length(v_snapshot->'tables'->v_table)>0 then
   execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1) on conflict do nothing',v_table,v_table)
    using v_snapshot->'tables'->v_table;
   get diagnostics v_restored = row_count;
  end if;
 end loop;
 insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_institution_id,v_user,'academic_year.backup.restored','academic_year_backup',p_backup_id::text,
   jsonb_build_object('academic_year_id',p_academic_year_id,'merge_mode','insert_missing_only','format','EDUNEXA_ACADEMIC_BACKUP'));
 return jsonb_build_object('restored',true,'mode','insert_missing_only','message','Se incorporaron únicamente registros faltantes; los registros existentes no se sobrescribieron.');
end;
$$;
revoke all on function private.restore_academic_year_backup_impl(uuid,uuid,uuid) from public,anon;
grant execute on function private.restore_academic_year_backup_impl(uuid,uuid,uuid) to authenticated;
create or replace function public.restore_academic_year_backup(p_institution_id uuid,p_academic_year_id uuid,p_backup_id uuid)
returns jsonb language sql set search_path=''
as $$ select private.restore_academic_year_backup_impl($1,$2,$3); $$;
revoke all on function public.restore_academic_year_backup(uuid,uuid,uuid) from public,anon;
grant execute on function public.restore_academic_year_backup(uuid,uuid,uuid) to authenticated;

create or replace function private.restore_academic_year_backup_package_impl(
 p_institution_id uuid,p_academic_year_id uuid,p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_backup_id uuid; v_result jsonb;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object'
  or p_snapshot->>'format'<>'EDUNEXA_ACADEMIC_BACKUP'
  or (p_snapshot->>'schema_version')::integer not in (1)
  or p_snapshot->>'institution_id'<>p_institution_id::text
  or p_snapshot->>'academic_year_id'<>p_academic_year_id::text
  or jsonb_typeof(p_snapshot->'tables') is distinct from 'object'
  or not exists(select 1 from public.academic_years where id=p_academic_year_id and institution_id=p_institution_id) then
  raise exception 'Backup package is not compatible with this institution or academic year' using errcode='22023';
 end if;
 insert into public.institution_academic_backups(institution_id,academic_year_id,created_by,snapshot)
 values(p_institution_id,p_academic_year_id,v_user,p_snapshot) returning id into v_backup_id;
 v_result:=private.restore_academic_year_backup_impl(p_institution_id,p_academic_year_id,v_backup_id);
 return v_result||jsonb_build_object('backup_id',v_backup_id);
end;
$$;
revoke all on function private.restore_academic_year_backup_package_impl(uuid,uuid,jsonb) from public,anon;
grant execute on function private.restore_academic_year_backup_package_impl(uuid,uuid,jsonb) to authenticated;
create or replace function public.restore_academic_year_backup_package(p_institution_id uuid,p_academic_year_id uuid,p_snapshot jsonb)
returns jsonb language sql set search_path=''
as $$ select private.restore_academic_year_backup_package_impl($1,$2,$3); $$;
revoke all on function public.restore_academic_year_backup_package(uuid,uuid,jsonb) from public,anon;
grant execute on function public.restore_academic_year_backup_package(uuid,uuid,jsonb) to authenticated;

create or replace function private.save_education_level_impl(
 p_institution_id uuid,p_level_id uuid,p_name text,p_code text,p_sort_order integer
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_name,''))) not between 2 and 80 or length(coalesce(p_code,''))>20 or p_sort_order not between 1 and 1000 then
  raise exception 'Invalid education level' using errcode='22023';
 end if;
 if p_level_id is null then
  insert into public.education_levels(institution_id,name,code,sort_order)
  values(p_institution_id,btrim(p_name),nullif(upper(btrim(coalesce(p_code,''))),''),p_sort_order)
  returning id into v_id;
 else
  update public.education_levels set name=btrim(p_name),code=nullif(upper(btrim(coalesce(p_code,''))),''),sort_order=p_sort_order
  where id=p_level_id and institution_id=p_institution_id returning id into v_id;
  if v_id is null then raise exception 'Education level not found' using errcode='P0002'; end if;
 end if;
 insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_institution_id,v_user,case when p_level_id is null then 'education.level.created' else 'education.level.updated' end,
 'education_level',v_id::text,jsonb_build_object('name',p_name,'code',p_code,'sort_order',p_sort_order));
 return v_id;
end;
$$;
revoke all on function private.save_education_level_impl(uuid,uuid,text,text,integer) from public,anon;
grant execute on function private.save_education_level_impl(uuid,uuid,text,text,integer) to authenticated;
create or replace function public.save_education_level(p_institution_id uuid,p_level_id uuid default null,p_name text default null,p_code text default null,p_sort_order integer default 1)
returns uuid language sql set search_path=''
as $$ select private.save_education_level_impl($1,$2,$3,$4,$5); $$;
revoke all on function public.save_education_level(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.save_education_level(uuid,uuid,text,text,integer) to authenticated;

create or replace function private.delete_education_level_impl(p_institution_id uuid,p_level_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid());
begin
 if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then raise exception 'Institution administration permission required' using errcode='42501'; end if;
 if exists(select 1 from public.courses where institution_id=p_institution_id and level_id=p_level_id) then
  raise exception 'Education level is assigned to courses; remove or reassign courses first' using errcode='23503';
 end if;
 delete from public.education_levels where id=p_level_id and institution_id=p_institution_id;
 if not found then raise exception 'Education level not found' using errcode='P0002'; end if;
 insert into public.audit_logs(institution_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_institution_id,v_user,'education.level.deleted','education_level',p_level_id::text,'{}'::jsonb);
end;
$$;
revoke all on function private.delete_education_level_impl(uuid,uuid) from public,anon;
grant execute on function private.delete_education_level_impl(uuid,uuid) to authenticated;
create or replace function public.delete_education_level(p_institution_id uuid,p_level_id uuid)
returns void language sql set search_path=''
as $$ select private.delete_education_level_impl($1,$2); $$;
revoke all on function public.delete_education_level(uuid,uuid) from public,anon;
grant execute on function public.delete_education_level(uuid,uuid) to authenticated;
