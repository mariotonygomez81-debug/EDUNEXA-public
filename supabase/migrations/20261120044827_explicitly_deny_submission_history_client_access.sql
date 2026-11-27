CREATE POLICY submission_revisions_deny_client_access
  ON public.submission_revisions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY submission_grade_events_deny_client_access
  ON public.submission_grade_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
