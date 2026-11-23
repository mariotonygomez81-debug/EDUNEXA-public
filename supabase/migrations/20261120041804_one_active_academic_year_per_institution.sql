-- Enforce a single active academic year per school, including concurrent requests.
CREATE UNIQUE INDEX academic_years_one_active_per_institution_idx
ON public.academic_years (institution_id)
WHERE status = 'active';