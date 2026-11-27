REVOKE INSERT ON TABLE public.support_tickets FROM authenticated;
GRANT INSERT (
  institution_id,
  created_by_membership_id,
  title,
  description,
  module_key,
  category
) ON TABLE public.support_tickets TO authenticated;
