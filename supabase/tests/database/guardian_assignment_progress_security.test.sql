-- pgTAP integration/security checks for the Tutor assignment-progress RPC.
-- Run only against the local Supabase database after applying the draft RPC.
-- All identities below are synthetic UUID claims; no auth.users rows or school data
-- are created by this test. Positive linked-child behavior remains covered by the
-- isolated PostgreSQL fixture until a complete local baseline/seed is available.

begin;

select plan(16);

-- The real application tables must have RLS enabled after the full migration set.
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='students'),
          'students has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='student_guardians'),
          'student_guardians has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='enrollments'),
          'enrollments has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='virtual_classrooms'),
          'virtual_classrooms has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.nspname=c.relnamespace
           where n.nspname='public' and c.relname='assignments'),
          'assignments has RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='submissions'),
          'submissions has RLS enabled');

select ok(to_regprocedure('public.list_my_child_assignment_progress(uuid,uuid)') is not null,
          'public Tutor RPC exists');
select ok(to_regprocedure('private.list_my_child_assignment_progress_impl(uuid,uuid)') is not null,
          'private Tutor implementation exists');

select ok((select p.prosecdef from pg_proc p
           where p.oid='private.list_my_child_assignment_progress_impl(uuid,uuid)'::regprocedure),
          'private implementation is SECURITY DEFINER and must enforce its own child scope');
select ok(not (select p.prosecdef from pg_proc p
               where p.oid='public.list_my_child_assignment_progress(uuid,uuid)'::regprocedure),
          'public wrapper remains SECURITY INVOKER');

select ok(has_function_privilege('authenticated',
          'public.list_my_child_assignment_progress(uuid,uuid)', 'EXECUTE'),
          'authenticated can execute the public RPC');
select ok(not has_function_privilege('anon',
          'public.list_my_child_assignment_progress(uuid,uuid)', 'EXECUTE'),
          'anon cannot execute the public RPC');

-- Simulate Supabase's JWT subject claim using a synthetic, non-existent user.
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select is(auth.uid()::text,'f1000000-0000-4000-8000-000000000001',
          'auth.uid() reads the authenticated JWT subject claim');

select throws_ok(
  $$select * from public.list_my_child_assignment_progress(
      'f2000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001')$$,
  '42501',
  'Student progress access denied',
  'authenticated user without an active guardian membership is denied'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_my_child_assignment_progress(
      'f2000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001')$$,
  '28000',
  'Authentication required',
  'missing JWT subject is rejected'
);

reset role;
select * from finish();
rollback;
