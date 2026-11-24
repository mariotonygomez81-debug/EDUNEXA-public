-- Exercise the actual four migration functions with synthetic identities.
\i supabase/migrations/20261124100000_enforce_role_scoped_academic_permissions.sql

-- Separate report-card audience helper copied verbatim from the existing
-- audience migration; this tests the dedicated flag independently.
create or replace function private.can_view_report_card(p_student_id uuid,p_institution_id uuid,p_audience text)
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists (
  select 1 from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active'
  and (
   (r.key='student' and p_audience in ('student','both') and exists(
    select 1 from public.student_memberships sm where sm.membership_id=m.id and sm.institution_id=p_institution_id and sm.student_id=p_student_id))
   or (r.key='guardian' and p_audience in ('guardian','both') and exists(
    select 1 from public.guardians g join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
    where g.membership_id=m.id and g.institution_id=p_institution_id and sg.student_id=p_student_id and sg.can_view_report_cards))
   or (r.key not in ('student','guardian') and private.can_access_student(p_student_id,p_institution_id,'grades.read'))
  )
 )
$function$;

grant usage on schema public,private,auth to authenticated;
grant execute on function auth.uid() to authenticated;
set role authenticated;

-- Teacher: assigned student/classroom succeeds; unassigned student fails.
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
do $$
begin
 if not private.can_access_student('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','students.read') then raise exception 'assigned teacher could not read assigned student'; end if;
 if private.can_access_student('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','students.read') then raise exception 'teacher accessed unassigned student'; end if;
 if not private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.read') then raise exception 'assigned teacher could not read classroom'; end if;
 if not private.can_manage_division('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','grades.manage') then raise exception 'teacher could not manage assigned division'; end if;
 if private.can_manage_division('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','grades.manage') then raise exception 'teacher managed unassigned division'; end if;
 if not private.can_manage_course_subject('50000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','grades.manage') then raise exception 'teacher could not manage assigned subject'; end if;
 if private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.delete') then raise exception 'unsupported classroom capability unexpectedly granted'; end if;
end $$;

-- Delegated capabilities are independent and each requires its own active flag.
DO $$
begin
 if not private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.materials.edit') then raise exception 'active can_edit_materials delegation denied'; end if;
 if not private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.assignments.edit') then raise exception 'active can_edit_assignments delegation denied'; end if;
 if not private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.grade') then raise exception 'active can_grade delegation denied'; end if;
 if not private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.attendance.manage') then raise exception 'active can_attendance delegation denied'; end if;
END $$;
reset role;
update public.classroom_teacher_permissions set can_edit_materials=false where id='58000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
DO $$ begin
 if private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.materials.edit') then raise exception 'disabled can_edit_materials still granted'; end if;
END $$;
reset role;
update public.classroom_teacher_permissions set can_edit_materials=true,can_edit_assignments=false where id='58000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
DO $$ begin
 if private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.assignments.edit') then raise exception 'disabled can_edit_assignments still granted'; end if;
END $$;
reset role;
update public.classroom_teacher_permissions set can_edit_assignments=true,can_grade=false where id='58000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
DO $$ begin
 if private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.grade') then raise exception 'disabled can_grade still granted'; end if;
END $$;
reset role;
update public.classroom_teacher_permissions set can_grade=true,can_attendance=false where id='58000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
DO $$ begin
 if private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.attendance.manage') then raise exception 'disabled can_attendance still granted'; end if;
END $$;
reset role;
update public.classroom_teacher_permissions set can_attendance=true,is_active=false where id='58000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
DO $$ begin
 if private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.materials.edit')
 or private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.assignments.edit')
 or private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.grade')
 or private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.attendance.manage')
 then raise exception 'inactive delegation retained a capability'; end if;
END $$;
reset role;
update public.classroom_teacher_permissions set is_active=true where id='58000000-0000-0000-0000-000000000001';

-- Student: own student record and classroom only.
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',false);
insert into public.classroom_members values('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','student');
do $$
begin
 if not private.can_access_student('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','grades.read') then raise exception 'student could not access own record'; end if;
 if private.can_access_student('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','grades.read') then raise exception 'student accessed another student'; end if;
 if not private.can_access_classroom('57000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','classroom.submit') then raise exception 'student could not submit in own classroom'; end if;
 -- Membership also has teacher role, but teacher's grades.manage must not
 -- combine with student scope to manufacture an administrative capability.
 if private.can_access_student('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','grades.manage') then raise exception 'multi-role permission borrowing detected'; end if;
 if private.can_access_student('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','grades.read') then raise exception 'cross-institution student access'; end if;
end $$;

-- Guardian: each academic flag is independently enforced; unlinked child denied.
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',false);
do $$
begin
 if not private.can_access_student('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','grades.read') then raise exception 'guardian grades flag should allow access'; end if;
 if private.can_access_student('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','attendance.read') then raise exception 'guardian attendance flag should deny access'; end if;
 if private.can_access_student('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','grades.read') then raise exception 'guardian accessed unlinked child'; end if;
 if private.can_view_report_card('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','guardian') then raise exception 'report card visible without can_view_report_cards'; end if;
end $$;
reset role;
update public.student_guardians set can_view_report_cards=true where student_id='60000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',false);
do $$ begin
 if not private.can_view_report_card('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','guardian') then raise exception 'guardian report-card flag should allow guardian audience'; end if;
 if private.can_view_report_card('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','student') then raise exception 'guardian received student-only report card'; end if;
end $$;

-- Suspended membership and institution boundary.
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000004',false);
do $$ begin
 if private.can_access_student('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','students.read') then raise exception 'suspended membership retained access'; end if;
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000005',false);
do $$ begin
 if private.can_access_student('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','students.read') then raise exception 'foreign institution membership crossed institution boundary'; end if;
end $$;

reset role;
select 'PASS: role-scoped authorization positive/negative PostgreSQL tests.' as result;
