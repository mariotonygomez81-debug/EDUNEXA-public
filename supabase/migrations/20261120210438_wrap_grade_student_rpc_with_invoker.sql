-- Keep the PostgREST RPC invoker-security while isolating the scoped privileged read.
create or replace function private.list_students_for_grades_impl(p_institution_id uuid)
returns table(id uuid, first_name text, last_name text, student_number text)
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

revoke all on function private.list_students_for_grades_impl(uuid) from public, anon;
grant execute on function private.list_students_for_grades_impl(uuid) to authenticated;

create or replace function public.list_students_for_grades(p_institution_id uuid)
returns table(id uuid, first_name text, last_name text, student_number text)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.list_students_for_grades_impl(p_institution_id);
$function$;

revoke all on function public.list_students_for_grades(uuid) from public, anon;
grant execute on function public.list_students_for_grades(uuid) to authenticated;