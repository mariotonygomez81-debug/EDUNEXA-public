CREATE OR REPLACE FUNCTION private.validate_submission_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  assignment_max_score numeric;
  assignment_is_published boolean;
BEGIN
  IF NEW.score IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.max_score, a.published_at IS NOT NULL
    INTO assignment_max_score, assignment_is_published
    FROM public.assignments a
   WHERE a.id = NEW.assignment_id
     AND a.institution_id = NEW.institution_id;

  IF NOT FOUND OR NOT assignment_is_published OR assignment_max_score IS NULL THEN
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

CREATE OR REPLACE FUNCTION private.validate_assignment_max_score_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.max_score IS NOT DISTINCT FROM OLD.max_score THEN
    RETURN NEW;
  END IF;

  IF NEW.max_score IS NOT NULL AND NEW.max_score <= 0 THEN
    RAISE EXCEPTION 'assignment maximum score must be greater than zero'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.submissions s
     WHERE s.assignment_id = OLD.id
       AND s.institution_id = OLD.institution_id
       AND s.score IS NOT NULL
       AND (NEW.max_score IS NULL OR s.score > NEW.max_score)
  ) THEN
    RAISE EXCEPTION 'assignment maximum cannot be reduced below an existing grade'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_submission_score() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.validate_assignment_max_score_change() FROM PUBLIC;

CREATE TRIGGER assignments_validate_max_score_change
  BEFORE UPDATE OF max_score ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_assignment_max_score_change();
