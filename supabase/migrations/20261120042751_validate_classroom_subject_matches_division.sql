-- Ensure a classroom subject belongs to the same course as its division.
CREATE OR REPLACE FUNCTION private.validate_classroom_course_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_division_course_id uuid;
  v_subject_course_id uuid;
BEGIN
  IF NEW.course_subject_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.course_id INTO v_division_course_id
  FROM public.divisions d
  WHERE d.id = NEW.division_id
    AND d.institution_id = NEW.institution_id;

  SELECT cs.course_id INTO v_subject_course_id
  FROM public.course_subjects cs
  WHERE cs.id = NEW.course_subject_id
    AND cs.institution_id = NEW.institution_id;

  IF v_division_course_id IS NULL OR v_subject_course_id IS NULL
     OR v_division_course_id <> v_subject_course_id THEN
    RAISE EXCEPTION 'La materia seleccionada no pertenece al curso de la división.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_classroom_course_subject() FROM PUBLIC;

DROP TRIGGER IF EXISTS virtual_classrooms_validate_course_subject
ON public.virtual_classrooms;

CREATE TRIGGER virtual_classrooms_validate_course_subject
BEFORE INSERT OR UPDATE OF institution_id, division_id, course_subject_id
ON public.virtual_classrooms
FOR EACH ROW
EXECUTE FUNCTION private.validate_classroom_course_subject();
