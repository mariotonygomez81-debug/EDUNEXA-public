-- Keep the first release of the Virtual Classroom closed until role-based policies are approved.
revoke all privileges on table
  public.virtual_classrooms,
  public.classroom_members,
  public.classroom_materials,
  public.assignments,
  public.submissions
from anon, authenticated;