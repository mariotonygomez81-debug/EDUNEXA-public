# EDUNEXA staging browser tests

The workflow `Student assignment E2E (staging)` is manual-only and targets
`https://edunexa-groq-staging.onrender.com`. It does not deploy or modify production.

## Required GitHub Actions secrets

- `E2E_INSTITUTION_SLUG`: institution slug in the staging project.
- `E2E_CLASSROOM_ID`: staging classroom UUID.
- `E2E_ASSIGNMENT_TITLE`: exact title of the disposable assignment used by the test.
- `E2E_STUDENT_EMAIL` / `E2E_STUDENT_PASSWORD`: dedicated staging student account.
- `E2E_TEACHER_EMAIL` / `E2E_TEACHER_PASSWORD`: dedicated staging teacher account with grading permission.

## Fixture requirements

Use synthetic test accounts and synthetic work only. Do not use real student or guardian accounts,
names, documents, grades, or production data.

The student and teacher must belong to the same staging institution and classroom. The student
must have an active enrollment and classroom membership. The assignment must be published,
not expired, have a maximum score of 100, and have no prior submission or grade for the test
student. Keep this assignment disposable: the test submits a PDF and grades it with 95%.

The browser test covers the student notification bell and enabled task-due preference, all four
document templates, image insertion and cloud recovery, header and footer restoration, multi-tab
optimistic concurrency, teacher invisibility before submission, multi-page PDF preview/download,
submission attachment visibility, and teacher grading feedback.

The database scheduler creates one in-app reminder per student and assignment when a published,
unsubmitted task enters its final 24 hours. It runs every 15 minutes in the staging Supabase project.
The reminder is visible in the notification center and links students to `Mis tareas`.

The E2E workflow is separate from normal CI because it needs dedicated staging credentials and
a disposable academic fixture. Normal CI runs static security regression checks, lint, TypeScript,
build, and public-route smoke tests.

## Dedicated due-notification browser test

The manual workflow **Student due notifications E2E (staging)** validates the student-facing reminder flow independently from the larger assignment/teacher workflow. It uses only a dedicated synthetic student account and never deploys or modifies production.

### Required GitHub Actions secrets

- E2E_INSTITUTION_SLUG: slug of the staging institution.
- E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD: dedicated synthetic student account in staging Supabase Auth.
- E2E_DUE_ASSIGNMENT_TITLE: exact title of the disposable, published task used for the reminder test.

Add these under GitHub repository **Settings → Secrets and variables → Actions → New repository secret**. Do not place credentials in workflow files, commits, issue comments, or logs. The workflow checks only whether each secret is present; it never prints secret values.

### Synthetic fixture setup

1. In the staging Supabase project only, create a dedicated Auth user with a mailbox controlled by the project operator and a unique test-only password. Do not reuse a real student's identity or email.
2. Create a matching active memberships record linked to that Auth user, assign the student role, create/link a synthetic students record, and give it an active enrollment plus active membership in a staging classroom.
3. Ensure the account has no other unread notifications and that its assignment_due in-app preference is enabled (or has no preference row, which defaults to enabled).
4. Publish one disposable assignment in that classroom. Set its due time between now and 24 hours from now, ensure it has not been submitted, and set its exact title in E2E_DUE_ASSIGNMENT_TITLE.
5. In GitHub Actions, select **Student due notifications E2E (staging)** and run workflow on branch feature/student-module-mobile. The test waits up to 16 minutes for the 15-minute staging scheduler, then verifies the notification card, bell badge, preference off/on controls, mark-as-read action, and zero unread count.
6. After the run, archive or delete the synthetic Auth user and fixture records through the approved staging administration process. Never run fixture setup or cleanup against production.

The workflow requires only the four secrets listed above; it does not require a teacher account, teacher password, service-role key, or database password.
