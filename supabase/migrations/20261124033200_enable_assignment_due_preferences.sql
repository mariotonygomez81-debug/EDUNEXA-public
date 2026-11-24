-- Extend the existing private preference RPC allowlist for assignment reminders.
CREATE OR REPLACE FUNCTION private.set_notification_preference_impl(
  p_institution_id uuid,
  p_notification_type text,
  p_in_app_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_institution_id IS NULL
    OR p_notification_type IS NULL
    OR p_notification_type NOT IN ('announcement','message','grade','attendance','support','assignment_due')
    OR p_in_app_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid notification preference' USING ERRCODE = '22023';
  END IF;

  SELECT m.id INTO v_membership_id
  FROM public.memberships m
  WHERE m.user_id = (SELECT auth.uid())
    AND m.institution_id = p_institution_id
    AND m.status = 'active'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'Active membership required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notification_preferences (
    institution_id, membership_id, notification_type, in_app_enabled
  ) VALUES (
    p_institution_id, v_membership_id, p_notification_type, p_in_app_enabled
  )
  ON CONFLICT (institution_id, membership_id, notification_type)
  DO UPDATE SET in_app_enabled = excluded.in_app_enabled, updated_at = now();

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION private.set_notification_preference_impl(uuid,text,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_notification_preference_impl(uuid,text,boolean)
  TO authenticated;
