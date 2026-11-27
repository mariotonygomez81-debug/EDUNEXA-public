ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_max_score_positive_check
  CHECK (max_score IS NULL OR max_score > 0);
