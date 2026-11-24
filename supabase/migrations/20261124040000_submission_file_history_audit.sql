-- Keep a tamper-resistant, scoped event for every finalized submission attachment.
CREATE TABLE public.submission_file_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL,
  file_id uuid NOT NULL UNIQUE REFERENCES public.classroom_file_objects(id) ON DELETE RESTRICT,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_file_events_submission_scope_fkey
    FOREIGN KEY (submission_id, institution_id)
    REFERENCES public.submissions(id, institution_id) ON DELETE CASCADE
);

CREATE INDEX submission_file_events_submission_idx
  ON public.submission_file_events (submission_id, changed_at DESC);

ALTER TABLE public.submission_file_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.submission_file_events FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY submission_file_events_deny_client_access
  ON public.submission_file_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION private.prevent_submission_file_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'submission file history is append-only'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION private.prevent_submission_file_event_mutation() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER submission_file_events_append_only
  BEFORE UPDATE OR DELETE ON public.submission_file_events
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_submission_file_event_mutation();

CREATE OR REPLACE FUNCTION private.capture_submission_file_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.purpose = 'submission'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'ready' THEN
    INSERT INTO public.submission_file_events (
      institution_id, submission_id, file_id, changed_by, changed_at
    ) VALUES (
      NEW.institution_id, NEW.submission_id, NEW.id,
      (SELECT auth.uid()), COALESCE(NEW.uploaded_at, now())
    )
    ON CONFLICT (file_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.capture_submission_file_event() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER classroom_file_objects_capture_submission_event
  AFTER UPDATE OF status ON public.classroom_file_objects
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_submission_file_event();

-- Backfill files already finalized before this audit trail was introduced.
INSERT INTO public.submission_file_events (
  institution_id, submission_id, file_id, changed_by, changed_at
)
SELECT f.institution_id, f.submission_id, f.id, m.user_id,
       COALESCE(f.uploaded_at, f.created_at)
FROM public.classroom_file_objects f
LEFT JOIN public.memberships m
  ON m.id = f.uploaded_by_membership_id
 AND m.institution_id = f.institution_id
WHERE f.purpose = 'submission'
  AND f.submission_id IS NOT NULL
  AND f.status IN ('ready', 'superseded')
ON CONFLICT (file_id) DO NOTHING;

-- Historical submission attachments remain readable to authorized classroom participants.
-- Materials retain the single-current-file rule.
CREATE OR REPLACE FUNCTION private.can_read_classroom_file(p_bucket_id text, p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_file_objects f
    WHERE f.bucket_id = p_bucket_id
      AND f.object_path = p_object_path
      AND f.status IN ('ready', 'superseded')
      AND (
        (
          f.purpose = 'material'
          AND f.status = 'ready'
          AND EXISTS (
            SELECT 1
            FROM public.classroom_materials cm
            WHERE cm.id = f.material_id
              AND cm.institution_id = f.institution_id
              AND cm.classroom_id = f.classroom_id
              AND cm.file_path = f.object_path
              AND private.can_access_classroom(f.classroom_id, f.institution_id, 'classroom.read')
          )
        )
        OR
        (
          f.purpose = 'submission'
          AND EXISTS (
            SELECT 1
            FROM public.submissions s
            WHERE s.id = f.submission_id
              AND s.institution_id = f.institution_id
              AND private.can_access_submission(s.id, s.institution_id, 'classroom.read')
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_classroom_file(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_classroom_file(text, text) TO authenticated;

-- The history endpoint returns file metadata only after enforcing classroom.grade.
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
    ), '[]'::jsonb),
    'files', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'file_id', f.id,
        'original_filename', f.original_filename,
        'mime_type', f.mime_type,
        'byte_size', f.byte_size,
        'changed_at', e.changed_at
      ) ORDER BY e.changed_at DESC, f.id)
      FROM public.submission_file_events e
      JOIN public.classroom_file_objects f
        ON f.id = e.file_id
       AND f.submission_id = e.submission_id
       AND f.institution_id = e.institution_id
      WHERE e.submission_id = p_submission_id
        AND e.institution_id = v_institution_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.get_submission_history_impl(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_submission_history_impl(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_classroom_submission_history(p_submission_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.get_submission_history_impl(p_submission_id);
$function$;

REVOKE ALL ON FUNCTION public.get_classroom_submission_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_classroom_submission_history(uuid) TO authenticated;
