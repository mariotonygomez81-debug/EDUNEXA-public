CREATE OR REPLACE FUNCTION private.get_my_student_assignment_draft_impl(p_assignment_id uuid)
RETURNS jsonb
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
  v_result jsonb;
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
    AND a.published_at IS NOT NULL
    AND (a.due_at IS NULL OR a.due_at >= now());

  IF v_institution_id IS NULL
     OR NOT private.can_submit_to_assignment(p_assignment_id, v_institution_id) THEN
    RAISE EXCEPTION 'Assignment is not available for drafts' USING ERRCODE = '42501';
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

  IF EXISTS (
    SELECT 1 FROM public.submissions s
    JOIN public.assignments a ON a.id = s.assignment_id AND a.institution_id = s.institution_id
    WHERE s.assignment_id = p_assignment_id
      AND s.institution_id = v_institution_id
      AND s.student_id = v_student_id
      AND s.score IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A graded submission cannot have an editable draft' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'html', d.content_html,
    'header', d.header,
    'footer', d.footer,
    'revision', d.revision,
    'updated_at', d.updated_at
  ) INTO v_result
  FROM public.student_assignment_drafts d
  WHERE d.assignment_id = p_assignment_id
    AND d.institution_id = v_institution_id
    AND d.classroom_id = v_classroom_id
    AND d.membership_id = v_membership_id
    AND d.student_id = v_student_id;

  RETURN COALESCE(v_result, jsonb_build_object('found', false, 'revision', 0));
END;
$function$;

CREATE OR REPLACE FUNCTION private.save_my_student_assignment_draft_impl(
  p_assignment_id uuid,
  p_html text,
  p_header text,
  p_footer text,
  p_expected_revision integer
)
RETURNS jsonb
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
  v_html text;
  v_saved public.student_assignment_drafts%ROWTYPE;
  v_current public.student_assignment_drafts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_html IS NULL OR octet_length(p_html) > 5242880
     OR char_length(COALESCE(p_header, '')) > 100
     OR char_length(COALESCE(p_footer, '')) > 100
     OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Draft content or revision is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_html ~* '<(script|iframe|object|embed|svg|math|form)([[:space:]>])'
     OR p_html ~* '[[:space:]]on[a-z]+[[:space:]]*='
     OR p_html ~* 'javascript[[:space:]]*:'
     OR p_html ~* 'srcdoc[[:space:]]*='
     OR p_html ~* '<img[^>]+src[[:space:]]*=[[:space:]]*["'']https?://' THEN
    RAISE EXCEPTION 'Draft contains unsupported or unsafe HTML' USING ERRCODE = '22023';
  END IF;
  v_html := p_html;

  SELECT a.institution_id, a.classroom_id, vc.division_id
    INTO v_institution_id, v_classroom_id, v_division_id
  FROM public.assignments a
  JOIN public.virtual_classrooms vc
    ON vc.id = a.classroom_id AND vc.institution_id = a.institution_id
  WHERE a.id = p_assignment_id
    AND a.published_at IS NOT NULL
    AND (a.due_at IS NULL OR a.due_at >= now());

  IF v_institution_id IS NULL
     OR NOT private.can_submit_to_assignment(p_assignment_id, v_institution_id) THEN
    RAISE EXCEPTION 'Assignment is not available for drafts' USING ERRCODE = '42501';
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

  IF EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.assignment_id = p_assignment_id
      AND s.institution_id = v_institution_id
      AND s.student_id = v_student_id
      AND s.score IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A graded submission cannot be edited' USING ERRCODE = '42501';
  END IF;

  IF p_expected_revision = 0 THEN
    INSERT INTO public.student_assignment_drafts (
      institution_id, classroom_id, assignment_id, membership_id, student_id,
      content_html, header, footer, revision
    ) VALUES (
      v_institution_id, v_classroom_id, p_assignment_id, v_membership_id, v_student_id,
      v_html, COALESCE(p_header, ''), COALESCE(p_footer, ''), 1
    )
    ON CONFLICT (assignment_id, membership_id) DO NOTHING
    RETURNING * INTO v_saved;

    IF FOUND THEN
      RETURN jsonb_build_object('saved', true, 'conflict', false, 'revision', v_saved.revision, 'updated_at', v_saved.updated_at);
    END IF;
  ELSE
    UPDATE public.student_assignment_drafts d
       SET content_html = v_html,
           header = COALESCE(p_header, ''),
           footer = COALESCE(p_footer, ''),
           revision = d.revision + 1,
           updated_at = now()
     WHERE d.assignment_id = p_assignment_id
       AND d.institution_id = v_institution_id
       AND d.classroom_id = v_classroom_id
       AND d.membership_id = v_membership_id
       AND d.student_id = v_student_id
       AND d.revision = p_expected_revision
    RETURNING * INTO v_saved;

    IF FOUND THEN
      RETURN jsonb_build_object('saved', true, 'conflict', false, 'revision', v_saved.revision, 'updated_at', v_saved.updated_at);
    END IF;
  END IF;

  SELECT * INTO v_current
  FROM public.student_assignment_drafts d
  WHERE d.assignment_id = p_assignment_id
    AND d.institution_id = v_institution_id
    AND d.classroom_id = v_classroom_id
    AND d.membership_id = v_membership_id
    AND d.student_id = v_student_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('saved', false, 'conflict', true, 'revision', 0, 'html', '', 'header', '', 'footer', '');
  END IF;

  RETURN jsonb_build_object(
    'saved', false, 'conflict', true,
    'revision', v_current.revision,
    'html', v_current.content_html,
    'header', v_current.header,
    'footer', v_current.footer,
    'updated_at', v_current.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.delete_my_student_assignment_draft_after_submission_impl(p_assignment_id uuid)
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

REVOKE ALL ON FUNCTION private.get_my_student_assignment_draft_impl(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.save_my_student_assignment_draft_impl(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.delete_my_student_assignment_draft_after_submission_impl(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_my_student_assignment_draft_impl(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.save_my_student_assignment_draft_impl(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.delete_my_student_assignment_draft_after_submission_impl(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_student_assignment_draft(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT private.get_my_student_assignment_draft_impl(p_assignment_id);
$function$;

CREATE OR REPLACE FUNCTION public.save_my_student_assignment_draft(
  p_assignment_id uuid, p_html text, p_header text, p_footer text, p_expected_revision integer
)
RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $function$
  SELECT private.save_my_student_assignment_draft_impl(p_assignment_id, p_html, p_header, p_footer, p_expected_revision);
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_student_assignment_draft_after_submission(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
SET search_path = ''
AS $function$
  SELECT private.delete_my_student_assignment_draft_after_submission_impl(p_assignment_id);
$function$;

REVOKE ALL ON FUNCTION public.get_my_student_assignment_draft(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.save_my_student_assignment_draft(uuid, text, text, text, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.delete_my_student_assignment_draft_after_submission(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_student_assignment_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_student_assignment_draft(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_student_assignment_draft_after_submission(uuid) TO authenticated;