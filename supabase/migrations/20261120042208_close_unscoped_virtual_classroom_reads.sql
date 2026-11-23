-- Keep virtual classroom metadata inaccessible until role- and student-scoped
-- policies are implemented and verified with authenticated test accounts.
DROP POLICY IF EXISTS virtual_classrooms_member_read ON public.virtual_classrooms;

CREATE POLICY virtual_classrooms_deny_client_access
ON public.virtual_classrooms
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
