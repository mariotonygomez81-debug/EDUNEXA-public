-- pgTAP checks for the central student/family portal RPC security boundary.
-- Run only against the isolated local Supabase database after the complete
-- foundation and application migrations have been reconstructed.
-- Uses synthetic JWT subjects only; creates no users or student records.

begin;

select plan(25);

-- Every table queried by the portal must enforce row-level security.
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='students'),
          'students has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='guardians'),
          'guardians has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='student_guardians'),
          'student_guardians has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='student_memberships'),
          'student_memberships has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='enrollments'),
          'enrollments has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='attendance_sessions'),
          'attendance_sessions has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='attendance_records'),
          'attendance_records has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='report_card_workflows'),
          'report_card_workflows has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='report_card_snapshots'),
          'report_card_snapshots has RLS enabled');

-- Public entry points and their private implementations must both exist.
select ok(to_regprocedure('public.list_my_portal_students(uuid)') is not null,
          'portal students RPC exists');
select ok(to_regprocedure('private.list_my_portal_students_impl(uuid)') is not null,
          'private portal students implementation exists');
select ok(to_regprocedure('public.list_my_student_attendance(uuid,uuid,integer)') is not null,
          'student attendance RPC exists');
select ok(to_regprocedure('private.list_my_student_attendance_impl(uuid,uuid,integer)') is not null,
          'private attendance implementation exists');

-- Privileged execution is confined to the private implementation; public wrappers
-- stay SECURITY INVOKER so caller identity is preserved.
select ok((select p.prosecdef from pg_proc p
           where p.oid='private.list_my_portal_students_impl(uuid)'::regprocedure),
          'private portal implementation is SECURITY DEFINER');
select ok(not (select p.prosecdef from pg_proc p
               where p.oid='public.list_my_portal_students(uuid)'::regprocedure),
          'public portal wrapper is SECURITY INVOKER');
select ok((select p.prosecdef from pg_proc p
           where p.oid='private.list_my_student_attendance_impl(uuid,uuid,integer)'::regprocedure),
          'private attendance implementation is SECURITY DEFINER');
select ok(not (select p.prosecdef from pg_proc p
               where p.oid='public.list_my_student_attendance(uuid,uuid,integer)'::regprocedure),
          'public attendance wrapper is SECURITY INVOKER');

-- Only signed-in application users can call the public RPCs.
select ok(has_function_privilege('authenticated',
          'public.list_my_portal_students(uuid)', 'EXECUTE'),
          'authenticated can execute portal students RPC');
select ok(not has_function_privilege('anon',
          'public.list_my_portal_students(uuid)', 'EXECUTE'),
          'anon cannot execute portal students RPC');
select ok(has_function_privilege('authenticated',
          'public.list_my_student_attendance(uuid,uuid,integer)', 'EXECUTE'),
          'authenticated can execute attendance RPC');
select ok(not has_function_privilege('anon',
          'public.list_my_student_attendance(uuid,uuid,integer)', 'EXECUTE'),
          'anon cannot execute attendance RPC');

-- A synthetic authenticated identity without an active membership must not read
-- any portal student or attendance data.
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select * from public.list_my_portal_students('f2000000-0000-4000-8000-000000000001')$$,
  '42501',
  'Active membership required',
  'portal RPC denies a user without active institutional membership'
);
select throws_ok(
  $$select * from public.list_my_student_attendance(
      'f2000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      50)$$,
  '42501',
  'Attendance access denied',
  'attendance RPC denies a user without active linked access'
);

-- Missing authentication is rejected before any student lookup.
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_my_portal_students('f2000000-0000-4000-8000-000000000001')$$,
  '28000',
  'Authentication required',
  'portal RPC rejects a missing JWT subject'
);
select throws_ok(
  $$select * from public.list_my_student_attendance(
      'f2000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      50)$$,
  '28000',
  'Authentication required',
  'attendance RPC rejects a missing JWT subject'
);

reset role;
select * from finish();
rollback;
