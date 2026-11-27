ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_score_nonnegative_check
  CHECK (score IS NULL OR score >= 0);

CREATE OR REPLACE FUNCTION private.validate_submission_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  assignment_max_score numeric;
BEGIN
  IF NEW.score IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.max_score
    INTO assignment_max_score
    FROM public.assignments a
   WHERE a.id = NEW.assignment_id
     AND a.institution_id = NEW.institution_id;

  IF NOT FOUND OR assignment_max_score IS NULL THEN
    RAISE EXCEPTION 'a published assignment with a maximum score is required before grading'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.score > assignment_max_score THEN
    RAISE EXCEPTION 'submission score exceeds assignment maximum'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_submission_score() FROM PUBLIC;

CREATE TRIGGER submissions_validate_score
  BEFORE INSERT OR UPDATE OF score, assignment_id, institution_id
  ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_submission_score();
