-- Read-only classroom listing without granting direct table access.
-- The public RPC is SECURITY INVOKER; the scoped implementation stays in private.
create or replace function private.list_accessible_classrooms_impl(p_institution_id uuid)
returns table (
  id uuid,
  division_id uuid,
  course_subject_id uuid,
  title text,
  description text,
  created_at timestamptz,
  division_name text,
  course_name text,
  subject_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    vc.id,
    vc.division_id,
    vc.course_subject_id,
    vc.title,
    vc.description,
    vc.created_at,
    d.name as division_name,
    c.name as course_name,
    s.name as subject_name
  from public.virtual_classrooms vc
  join public.divisions d
    on d.id = vc.division_id
   and d.institution_id = vc.institution_id
  join public.courses c
    on c.id = d.course_id
   and c.institution_id = d.institution_id
  left join public.course_subjects cs
    on cs.id = vc.course_subject_id
   and cs.institution_id = vc.institution_id
  left join public.subjects s
    on s.id = cs.subject_id
   and s.institution_id = cs.institution_id
  where vc.institution_id = p_institution_id
    and (select auth.uid()) is not null
    and private.can_access_classroom(
      vc.id,
      vc.institution_id,
      'classroom.read'
    )
  order by c.name, d.name, s.name nulls first, vc.title;
$function$;

revoke all on function private.list_accessible_classrooms_impl(uuid) from public, anon;
grant execute on function private.list_accessible_classrooms_impl(uuid) to authenticated;

create or replace function public.list_accessible_classrooms(p_institution_id uuid)
returns table (
  id uuid,
  division_id uuid,
  course_subject_id uuid,
  title text,
  description text,
  created_at timestamptz,
  division_name text,
  course_name text,
  subject_name text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.list_accessible_classrooms_impl(p_institution_id);
$function$;

revoke all on function public.list_accessible_classrooms(uuid) from public, anon;
grant execute on function public.list_accessible_classrooms(uuid) to authenticated;
