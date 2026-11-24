-- Student reminders for published assignments due in the next 24 hours.
-- The scheduler runs only in the Supabase project where this migration is applied.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check,
  ADD CONSTRAINT notifications_notification_type_check
    CHECK (notification_type IN ('announcement','message','grade','attendance','support','assignment_due')),
  DROP CONSTRAINT IF EXISTS notifications_resource_type_check,
  ADD CONSTRAINT notifications_resource_type_check
    CHECK (resource_type IN ('announcement','conversation','grade','attendance','support_ticket','assignment'));

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_notification_type_check,
  ADD CONSTRAINT notification_preferences_notification_type_check
    CHECK (notification_type IN ('announcement','message','grade','attendance','support','assignment_due'));

CREATE INDEX IF NOT EXISTS assignments_published_due_at_idx
  ON public.assignments (due_at, institution_id, classroom_id)
  WHERE published_at IS NOT NULL AND due_at IS NOT NULL;

CREATE OR REPLACE FUNCTION private.generate_assignment_due_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO public.notifications (
    institution_id,
    recipient_membership_id,
    notification_type,
    title,
    body,
    resource_type,
    resource_id
  )
  SELECT DISTINCT
    a.institution_id,
    m.id,
    'assignment_due',
    left('Tarea próxima a vencer: ' || a.title, 180),
    left(
      'La tarea «' || a.title || '» del aula «' || vc.title ||
      '» vence dentro de las próximas 24 horas. Entrá a Mis tareas para revisar la fecha y completar tu entrega.',
      500
    ),
    'assignment',
    a.id
  FROM public.assignments a
  JOIN public.virtual_classrooms vc
    ON vc.id = a.classroom_id
   AND vc.institution_id = a.institution_id
  JOIN public.classroom_members cm
    ON cm.classroom_id = a.classroom_id
   AND cm.institution_id = a.institution_id
   AND cm.member_role = 'student'
  JOIN public.memberships m
    ON m.id = cm.membership_id
   AND m.institution_id = cm.institution_id
   AND m.status = 'active'
  JOIN public.membership_roles mr
    ON mr.membership_id = m.id
   AND mr.institution_id = m.institution_id
  JOIN public.roles r
    ON r.id = mr.role_id
   AND r.key = 'student'
  JOIN public.student_memberships sm
    ON sm.membership_id = m.id
   AND sm.institution_id = m.institution_id
  JOIN public.enrollments e
    ON e.student_id = sm.student_id
   AND e.institution_id = sm.institution_id
   AND e.division_id = vc.division_id
   AND e.status = 'active'
   AND e.enrolled_on <= current_date
   AND (e.ended_on IS NULL OR e.ended_on >= current_date)
  WHERE a.published_at IS NOT NULL
    AND a.published_at <= now()
    AND a.due_at > now()
    AND a.due_at <= now() + interval '24 hours'
    AND coalesce((
      SELECT np.in_app_enabled
      FROM public.notification_preferences np
      WHERE np.institution_id = m.institution_id
        AND np.membership_id = m.id
        AND np.notification_type = 'assignment_due'
    ), true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.submissions s
      WHERE s.institution_id = a.institution_id
        AND s.assignment_id = a.id
        AND s.student_id = sm.student_id
        AND s.submitted_at IS NOT NULL
    )
  ON CONFLICT (
    institution_id,
    recipient_membership_id,
    notification_type,
    resource_type,
    resource_id
  ) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION private.generate_assignment_due_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

-- Replace only this named job so reapplying the migration is safe.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'edunexa-assignment-due-notifications';

SELECT cron.schedule(
  'edunexa-assignment-due-notifications',
  '*/15 * * * *',
  'select private.generate_assignment_due_notifications();'
);
