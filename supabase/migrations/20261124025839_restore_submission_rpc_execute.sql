-- Preserve the authenticated RPC wrapper's ability to invoke the protected implementation.
-- The implementation remains non-exposed in the private schema.
GRANT EXECUTE ON FUNCTION private.submit_classroom_assignment_impl(uuid, text) TO authenticated;
