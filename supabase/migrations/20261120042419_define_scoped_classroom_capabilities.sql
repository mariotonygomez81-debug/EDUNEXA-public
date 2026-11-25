-- Split virtual-classroom capabilities and define scoped authorization helper.
-- Access policies remain deny-by-default until the positive role matrix is tested.

INSERT INTO public.permissions (key, description)
VALUES
  ('classroom.read', 'Consultar aulas, materiales y tareas según vínculos académicos'),
  ('classroom.submit', 'Entregar y actualizar trabajos propios mientras estén habilitados'),
  ('classroom.grade', 'Calificar entregas y publicar devoluciones en aulas asignadas')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.key = 'classroom.manage'
  AND r.key NOT IN ('institution_admin', 'teacher');

DELETE FROM public.role_permissions rp
USING public.permissions p
WHERE rp.permission_id = p.id
  AND p.key = 'classroom.participate';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.key = 'classroom.read'
WHERE r.key IN ('institution_admin', 'teacher', 'director', 'student', 'guardian')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.key = 'classroom.grade'
WHERE r.key IN ('institution_admin', 'teacher')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.key = 'classroom.submit'
WHERE r.key = 'student'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.can_access_classroom(
  p_classroom_id uuid,
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
    FROM public.virtual_classrooms vc
    JOIN public.memberships m
      ON m.institution_id = vc.institution_id
     AND m.user_id = (SELECT auth.uid())
     AND m.status = 'active'
    JOIN public.membership_roles mr
      ON mr.membership_id = m.id
     AND mr.institution_id = m.institution_id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE vc.id = p_classroom_id
      AND vc.institution_id = p_institution_id
      AND private.has_institution_permission(p_institution_id, p_permission_key)
      AND (
        (r.key = 'institution_admin' AND p_permission_key IN
          ('classroom.read', 'classroom.manage', 'classroom.grade'))
        OR (r.key = 'director' AND p_permission_key = 'classroom.read')
        OR (
          r.key = 'teacher'
          AND p_permission_key IN ('classroom.read', 'classroom.manage', 'classroom.grade')
          AND EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.membership_id = m.id
              AND sa.institution_id = vc.institution_id
              AND (
                sa.division_id = vc.division_id
                OR (vc.course_subject_id IS NOT NULL
                    AND sa.course_subject_id = vc.course_subject_id)
                -- Exact course-subject assignment is already covered by the predicate above.
                -- The former assigned_cs reference had no FROM/JOIN alias and broke migration execution.
              )
              AND (sa.starts_on IS NULL OR sa.starts_on <= CURRENT_DATE)
              AND (sa.ends_on IS NULL OR sa.ends_on >= CURRENT_DATE)
          )
        )
        OR (
          r.key = 'student'
          AND p_permission_key IN ('classroom.read', 'classroom.submit')
          AND EXISTS (
            SELECT 1
            FROM public.student_memberships sm
            JOIN public.enrollments e
              ON e.student_id = sm.student_id
             AND e.institution_id = sm.institution_id
            WHERE sm.membership_id = m.id
              AND sm.institution_id = vc.institution_id
              AND e.division_id = vc.division_id
              AND e.status = 'active'
          )
        )
        OR (
          r.key = 'guardian'
          AND p_permission_key = 'classroom.read'
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
              AND g.institution_id = vc.institution_id
              AND e.division_id = vc.division_id
              AND e.status = 'active'
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.can_access_classroom(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_classroom(uuid, uuid, text) TO authenticated;
