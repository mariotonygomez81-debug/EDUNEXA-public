-- Keep the private draft until the generated PDF has been uploaded and finalized.
CREATE OR REPLACE FUNCTION private.submit_classroom_assignment_impl(p_assignment_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_institution_id uuid;
  v_division_id uuid;
  v_student_id uuid;
  v_submission_id uuid;
  v_existing_score numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_body IS NULL OR length(btrim(p_body)) < 1 OR length(p_body) > 20000 THEN
    RAISE EXCEPTION 'Submission text must contain between 1 and 20000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT a.institution_id, vc.division_id
    INTO v_institution_id, v_division_id
  FROM public.assignments a
  JOIN public.virtual_classrooms vc
    ON vc.id = a.classroom_id AND vc.institution_id = a.institution_id
  WHERE a.id = p_assignment_id
    AND a.published_at IS NOT NULL
    AND (a.due_at IS NULL OR a.due_at >= now());

  IF v_institution_id IS NULL OR NOT private.can_submit_to_assignment(p_assignment_id, v_institution_id) THEN
    RAISE EXCEPTION 'Assignment is not available for submission' USING ERRCODE = '42501';
  END IF;

  SELECT sm.student_id INTO v_student_id
  FROM public.memberships m
  JOIN public.student_memberships sm ON sm.membership_id = m.id AND sm.institution_id = m.institution_id
  JOIN public.enrollments e ON e.student_id = sm.student_id AND e.institution_id = sm.institution_id
  WHERE m.user_id = v_user_id AND m.institution_id = v_institution_id AND m.status = 'active'
    AND e.division_id = v_division_id AND e.status = 'active'
  ORDER BY e.created_at DESC LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Active student enrollment required' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.score INTO v_submission_id, v_existing_score
  FROM public.submissions s
  WHERE s.institution_id = v_institution_id AND s.assignment_id = p_assignment_id AND s.student_id = v_student_id
  FOR UPDATE;

  IF v_submission_id IS NULL THEN
    INSERT INTO public.submissions (institution_id, assignment_id, student_id, body, submitted_at)
    VALUES (v_institution_id, p_assignment_id, v_student_id, btrim(p_body), now())
    RETURNING id INTO v_submission_id;

    INSERT INTO public.submission_revisions (
      institution_id, submission_id, revision_number, body, file_path, submitted_at, changed_by
    ) VALUES (v_institution_id, v_submission_id, 1, btrim(p_body), null, now(), v_user_id);
  ELSE
    IF v_existing_score IS NOT NULL THEN
      RAISE EXCEPTION 'A graded submission cannot be edited' USING ERRCODE = '42501';
    END IF;

    UPDATE public.submissions SET body = btrim(p_body), submitted_at = now()
    WHERE id = v_submission_id AND institution_id = v_institution_id;
  END IF;

  -- Do not delete the rich-text draft here: the PDF upload still has to succeed.
  RETURN v_submission_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_student_assignment_draft_after_submission(p_assignment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_institution_id uuid;
  v_classroom_id uuid;
  v_division_id uuid;
  v_membership_id uuid;
  v_student_id uuid;
  v_submission_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT a.institution_id, a.classroom_id, vc.division_id
    INTO v_institution_id, v_classroom_id, v_division_id
  FROM public.assignments a
  JOIN public.virtual_classrooms vc
    ON vc.id = a.classroom_id AND vc.institution_id = a.institution_id
  WHERE a.id = p_assignment_id
    AND a.published_at IS NOT NULL;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found' USING ERRCODE = '42501';
  END IF;

  SELECT m.id, sm.student_id
    INTO v_membership_id, v_student_id
  FROM public.memberships m
  JOIN public.student_memberships sm
    ON sm.membership_id = m.id AND sm.institution_id = m.institution_id
  JOIN public.membership_roles mr
    ON mr.membership_id = m.id AND mr.institution_id = m.institution_id
  JOIN public.roles r ON r.id = mr.role_id AND r.key = 'student'
  JOIN public.enrollments e
    ON e.student_id = sm.student_id AND e.institution_id = sm.institution_id
  JOIN public.classroom_members cm
    ON cm.membership_id = m.id
   AND cm.institution_id = m.institution_id
   AND cm.classroom_id = v_classroom_id
   AND cm.member_role = 'student'
  WHERE m.user_id = v_user_id
    AND m.institution_id = v_institution_id
    AND m.status = 'active'
    AND e.division_id = v_division_id
    AND e.status = 'active'
    AND e.enrolled_on <= current_date
    AND (e.ended_on IS NULL OR e.ended_on >= current_date)
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_membership_id IS NULL OR v_student_id IS NULL THEN
    RAISE EXCEPTION 'Active student classroom membership required' USING ERRCODE = '42501';
  END IF;

  SELECT s.id INTO v_submission_id
  FROM public.submissions s
  WHERE s.assignment_id = p_assignment_id
    AND s.institution_id = v_institution_id
    AND s.student_id = v_student_id;

  IF v_submission_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.classroom_file_objects f
    WHERE f.submission_id = v_submission_id
      AND f.institution_id = v_institution_id
      AND f.classroom_id = v_classroom_id
      AND f.uploaded_by_membership_id = v_membership_id
      AND f.purpose = 'submission'
      AND f.mime_type = 'application/pdf'
      AND f.status = 'ready'
  ) THEN
    RAISE EXCEPTION 'A finalized PDF attachment is required before draft cleanup' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.student_assignment_drafts d
  WHERE d.assignment_id = p_assignment_id
    AND d.institution_id = v_institution_id
    AND d.classroom_id = v_classroom_id
    AND d.membership_id = v_membership_id
    AND d.student_id = v_student_id;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_my_student_assignment_draft_after_submission(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_student_assignment_draft_after_submission(uuid) TO authenticated;
