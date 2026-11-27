-- Tighten learner/family submission visibility to currently active enrollments.
CREATE OR REPLACE FUNCTION private.can_access_submission(
  p_submission_id uuid,
  p_institution_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.assignments a
      ON a.id = s.assignment_id
     AND a.institution_id = s.institution_id
    JOIN public.virtual_classrooms vc
      ON vc.id = a.classroom_id
     AND vc.institution_id = a.institution_id
    JOIN public.memberships m
      ON m.institution_id = s.institution_id
     AND m.user_id = (SELECT auth.uid())
     AND m.status = 'active'
    JOIN public.membership_roles mr
      ON mr.membership_id = m.id
     AND mr.institution_id = m.institution_id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE s.id = p_submission_id
      AND s.institution_id = p_institution_id
      AND (
        (
          p_permission_key = 'classroom.grade'
          AND private.can_access_classroom(vc.id, vc.institution_id, 'classroom.grade')
        )
        OR
        (
          p_permission_key = 'classroom.read'
          AND private.has_institution_permission(p_institution_id, 'classroom.read')
          AND (
            (
              r.key IN ('institution_admin', 'director', 'teacher')
              AND private.can_access_classroom(vc.id, vc.institution_id, 'classroom.read')
            )
            OR
            (
              r.key = 'student'
              AND EXISTS (
                SELECT 1
                FROM public.student_memberships sm
                JOIN public.enrollments e
                  ON e.student_id = sm.student_id
                 AND e.institution_id = sm.institution_id
                WHERE sm.membership_id = m.id
                  AND sm.institution_id = s.institution_id
                  AND sm.student_id = s.student_id
                  AND e.division_id = vc.division_id
                  AND e.status = 'active'
              )
            )
            OR
            (
              r.key = 'guardian'
              AND EXISTS (
                SELECT 1
                FROM public.guardians g
                JOIN public.student_guardians sg
                  ON sg.guardian_id = g.id
                 AND sg.institution_id = g.institution_id
                JOIN public.enrollments e
                  ON e.student_id = sg.student_id
                 AND e.institution_id = sg.institution_id
                WHERE g.membership_id = m.id
                  AND g.institution_id = s.institution_id
                  AND sg.student_id = s.student_id
                  AND e.division_id = vc.division_id
                  AND e.status = 'active'
              )
            )
          )
        )
      )
  );
$function$;
REVOKE ALL ON FUNCTION private.can_access_submission(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_submission(uuid, uuid, text) TO authenticated;
