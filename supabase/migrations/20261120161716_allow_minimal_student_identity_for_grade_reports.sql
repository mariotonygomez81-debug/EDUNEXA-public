-- Return only the minimum student identity fields needed by the academic report.
-- Access is checked against grades.read and the existing student-level relationship helper.
create or replace function public.list_students_for_grades(p_institution_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  student_number text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id, s.first_name, s.last_name, s.student_number
  from public.students s
  where s.institution_id = p_institution_id
    and private.can_access_student(s.id, s.institution_id, 'grades.read')
  order by s.last_name, s.first_name;
$function$;

-- PUBLIC and anon are revoked explicitly because anon may have a direct grant
-- from project-level default privileges.
revoke all on function public.list_students_for_grades(uuid) from public, anon;
grant execute on function public.list_students_for_grades(uuid) to authenticated;
