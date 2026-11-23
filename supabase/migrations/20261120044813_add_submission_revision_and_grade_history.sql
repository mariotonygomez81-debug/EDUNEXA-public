CREATE TABLE public.submission_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  body text,
  file_path text,
  submitted_at timestamptz,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_revisions_submission_scope_fkey
    FOREIGN KEY (submission_id, institution_id)
    REFERENCES public.submissions(id, institution_id) ON DELETE CASCADE,
  CONSTRAINT submission_revisions_unique_number
    UNIQUE (submission_id, revision_number)
);

CREATE TABLE public.submission_grade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL,
  previous_score numeric,
  new_score numeric,
  previous_feedback text,
  new_feedback text,
  previous_graded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  new_graded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_grade_events_submission_scope_fkey
    FOREIGN KEY (submission_id, institution_id)
    REFERENCES public.submissions(id, institution_id) ON DELETE CASCADE
);

CREATE INDEX submission_revisions_submission_idx
  ON public.submission_revisions (submission_id, revision_number DESC);
CREATE INDEX submission_grade_events_submission_idx
  ON public.submission_grade_events (submission_id, changed_at DESC);

ALTER TABLE public.submission_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_grade_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.submission_revisions FROM anon, authenticated;
REVOKE ALL ON TABLE public.submission_grade_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.capture_submission_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  next_revision integer;
BEGIN
  IF OLD.body IS DISTINCT FROM NEW.body
     OR OLD.file_path IS DISTINCT FROM NEW.file_path
     OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at THEN
    SELECT COALESCE(MAX(r.revision_number), 0) + 1
      INTO next_revision
      FROM public.submission_revisions r
     WHERE r.submission_id = OLD.id;

    INSERT INTO public.submission_revisions (
      institution_id, submission_id, revision_number,
      body, file_path, submitted_at, changed_by
    ) VALUES (
      OLD.institution_id, OLD.id, next_revision,
      OLD.body, OLD.file_path, OLD.submitted_at, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.capture_submission_grade_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.score IS DISTINCT FROM NEW.score
     OR OLD.feedback IS DISTINCT FROM NEW.feedback
     OR OLD.graded_by IS DISTINCT FROM NEW.graded_by THEN
    INSERT INTO public.submission_grade_events (
      institution_id, submission_id,
      previous_score, new_score,
      previous_feedback, new_feedback,
      previous_graded_by, new_graded_by, changed_by
    ) VALUES (
      NEW.institution_id, NEW.id,
      OLD.score, NEW.score,
      OLD.feedback, NEW.feedback,
      OLD.graded_by, NEW.graded_by, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.prevent_submission_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'submission history is append-only'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION private.capture_submission_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.capture_submission_grade_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.prevent_submission_history_mutation() FROM PUBLIC;

CREATE TRIGGER submissions_capture_revision
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_submission_revision();

CREATE TRIGGER submissions_capture_grade_event
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_submission_grade_event();

CREATE TRIGGER submission_revisions_append_only
  BEFORE UPDATE OR DELETE ON public.submission_revisions
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_submission_history_mutation();

CREATE TRIGGER submission_grade_events_append_only
  BEFORE UPDATE OR DELETE ON public.submission_grade_events
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_submission_history_mutation();
