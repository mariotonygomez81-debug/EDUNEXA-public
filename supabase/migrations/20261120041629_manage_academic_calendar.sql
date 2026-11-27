-- Permit institutional administrators to configure academic years and grading periods.
-- No deletion policy is added: referenced academic records must remain historically stable.

CREATE POLICY academic_years_institution_admin_insert
ON public.academic_years
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_institution_permission(institution_id, 'institution.manage')
);

CREATE POLICY academic_years_institution_admin_update
ON public.academic_years
FOR UPDATE
TO authenticated
USING (
  private.has_institution_permission(institution_id, 'institution.manage')
)
WITH CHECK (
  private.has_institution_permission(institution_id, 'institution.manage')
);

CREATE POLICY grading_periods_institution_admin_insert
ON public.grading_periods
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_institution_permission(institution_id, 'institution.manage')
);

CREATE POLICY grading_periods_institution_admin_update
ON public.grading_periods
FOR UPDATE
TO authenticated
USING (
  private.has_institution_permission(institution_id, 'institution.manage')
)
WITH CHECK (
  private.has_institution_permission(institution_id, 'institution.manage')
);
