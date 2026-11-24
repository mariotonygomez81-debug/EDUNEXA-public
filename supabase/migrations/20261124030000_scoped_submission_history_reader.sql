-- Expose append-only submission history only to staff allowed to grade the classroom.
CREATE OR REPLACE FUNCTION private.get_submission_history_impl(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_institution_id uuid;
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT s.institution_id INTO v_institution_id
  FROM public.submissions s
  WHERE s.id = p_submission_id;

  IF v_institution_id IS NULL
     OR NOT private.can_access_submission(p_submission_id, v_institution_id, 'classroom.grade') THEN
    RAISE EXCEPTION 'Submission history access denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'revisions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'revision_number', r.revision_number,
        'body', r.body,
        'file_path', r.file_path,
        'submitted_at', r.submitted_at,
        'changed_at', r.changed_at
      ) ORDER BY r.revision_number DESC)
      FROM public.submission_revisions r
      WHERE r.submission_id = p_submission_id
        AND r.institution_id = v_institution_id
    ), '[]'::jsonb),
    'grades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'previous_score', g.previous_score,
        'new_score', g.new_score,
        'previous_feedback', g.previous_feedback,
        'new_feedback', g.new_feedback,
        'changed_at', g.changed_at
      ) ORDER BY g.changed_at DESC)
      FROM public.submission_grade_events g
      WHERE g.submission_id = p_submission_id
        AND g.institution_id = v_institution_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.get_submission_history_impl(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_classroom_submission_history(p_submission_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.get_submission_history_impl(p_submission_id);
$function$;

REVOKE ALL ON FUNCTION public.get_classroom_submission_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_classroom_submission_history(uuid) TO authenticated;
