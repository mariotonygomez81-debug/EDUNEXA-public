# Tutor assignment-progress: pgTAP local security checks

This suite is intentionally local-only. It does not create an executable migration and must never be run against a linked/hosted project.

## Current coverage

`supabase/tests/database/guardian_assignment_progress_security.test.sql` checks:

- RLS is enabled on the six academic tables used by the read path.
- Both RPC signatures exist after the draft has been loaded.
- The private implementation is `SECURITY DEFINER` and the public wrapper is `SECURITY INVOKER`.
- `authenticated` can execute the public wrapper and `anon` cannot.
- `auth.uid()` reads the synthetic JWT subject claim.
- Calls without a JWT subject and calls by an authenticated user without a guardian membership are rejected.

The suite uses fixed synthetic UUID claims only. It creates no `auth.users` records and no school/student records.

## Important coverage boundary

This is the first real-Supabase/PostgreSQL integration layer, not yet a complete positive-path Auth/RLS test. It does not prove that a guardian linked to a child can retrieve that child's records, that a second guardian cannot, or that `can_view_grades` hides scores under the actual deployed schema. Those positive/negative row-level scenarios remain covered only by the existing isolated PostgreSQL fixture, whose authorization helpers are simulated.

Before adding real synthetic Auth users and linked-child fixtures, the repository needs a reproducible local baseline. At the current branch tip, the first tracked migration creates academic tables with foreign keys to `public.institutions`, `public.memberships`, `public.roles`, and `public.campuses`, but no earlier bootstrap migration for those foundational tables is tracked under `supabase/migrations`. Therefore a clean `supabase db reset` cannot yet be assumed to reconstruct the full application schema. Do not work around this by connecting to the production Supabase project or by exporting its student data.

## Safe local sequence

1. Install Docker Desktop and the Supabase CLI locally. Confirm versions with `docker --version` and `supabase --version`.
2. Work from the repository checkout on `feature/tutor-module`. Do not run `supabase link`.
3. Start the local stack with `supabase start`, then inspect `supabase status`. Confirm the target is localhost before running any database command.
4. Attempt `supabase db reset` only after the missing foundational schema has been restored to version control. If it fails on a missing base table, stop and repair the repository's migration baseline; do not point the CLI at a hosted project.
5. Once the full local migrations apply, load the draft RPC into the local database only. Obtain the local database URL from `supabase status`, export it as `LOCAL_DB_URL`, and run:

   ```bash
   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f docs/database/guardian-assignment-progress.draft.sql
   ```

6. Run the pgTAP file against the local stack:

   ```bash
   supabase test db supabase/tests/database/guardian_assignment_progress_security.test.sql
   ```

7. Record the full output and any SQLSTATE failures. A passing run proves only the assertions listed under Current coverage; it does not replace positive-path tests with synthetic Auth users and real membership/guardian rows.

Supabase CLI's `test db` command runs pgTAP files from `supabase/tests` against the local database. Avoid `--remote`, `--linked`, `supabase link`, and any hosted database URL.

## Required next test layer

After the baseline is reproducible, add transaction-scoped fixtures using synthetic `auth.users` identities and real rows for institution, membership, role/permission, guardian, student, student_guardians, enrollment, division, course, subject, classroom, assignment, and submission. Exercise the RPC as `authenticated` under each JWT subject and direct table reads under the same role. Required cases:

- linked guardian + active enrollment + published assignment: task metadata visible;
- unlinked child and another institution: no rows / generic denial;
- inactive membership and ended/withdrawn enrollment: denied;
- unpublished assignment: absent;
- `can_view_grades=false`: progress visible, score/max_score null;
- `can_view_grades=true` with institution `grades.read`: score/max_score visible;
- revoke institution `grades.read`: score/max_score hidden even when the child flag is true;
- submission body, feedback, file path, and revision data never returned;
- direct table reads obey the real RLS and table grants, independently of the privileged RPC.

Keep historical grade visibility gated by both `can_view_grades` and the canonical `grades.read` permission.
