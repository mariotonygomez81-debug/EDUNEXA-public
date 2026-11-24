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
