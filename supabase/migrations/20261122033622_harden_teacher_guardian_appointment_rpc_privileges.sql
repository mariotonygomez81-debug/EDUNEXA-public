-- Restrict internal appointment implementations to authenticated callers only.
-- Public RPC wrappers remain SECURITY INVOKER and require these grants.
revoke execute on function private.create_teacher_guardian_appointment_impl(uuid, uuid, timestamptz, text) from public, anon;
revoke execute on function private.list_guardian_teacher_appointments_impl() from public, anon;
revoke execute on function private.list_teacher_guardian_appointments_impl() from public, anon;
revoke execute on function private.respond_teacher_guardian_appointment_impl(uuid, text) from public, anon;
revoke execute on function private.update_teacher_guardian_appointment_impl(uuid, text) from public, anon;

grant execute on function private.create_teacher_guardian_appointment_impl(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function private.list_guardian_teacher_appointments_impl() to authenticated;
grant execute on function private.list_teacher_guardian_appointments_impl() to authenticated;
grant execute on function private.respond_teacher_guardian_appointment_impl(uuid, text) to authenticated;
grant execute on function private.update_teacher_guardian_appointment_impl(uuid, text) to authenticated;
