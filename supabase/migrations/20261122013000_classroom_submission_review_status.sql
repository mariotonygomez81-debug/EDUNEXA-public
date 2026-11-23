-- Seguimiento de entrega y revisión docente de trabajos prácticos del Aula Virtual.
alter table public.submissions
  add column if not exists review_status text;

alter table public.submissions
  drop constraint if exists submissions_review_status_check;

alter table public.submissions
  add constraint submissions_review_status_check
  check (review_status is null or review_status in ('visto','aprobado','desaprobado','corregir'));

create table if not exists private.classroom_submission_review_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  submission_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  old_status text,
  new_status text,
  created_at timestamptz not null default now()
);
revoke all on private.classroom_submission_review_events from public, anon, authenticated;

create or replace function private.list_classroom_assignment_roster_impl(p_classroom_id uuid)
returns table(
  assignment_id uuid,
  student_id uuid,
  student_first_name text,
  student_last_name text,
  student_number text,
  submission_id uuid,
  submitted boolean,
  submitted_at timestamptz,
  body text,
  review_status text,
  score numeric,
  feedback text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_institution_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select vc.institution_id into v_institution_id
  from public.virtual_classrooms vc
  where vc.id=p_classroom_id;

  if v_institution_id is null
     or not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.grade') then
    raise exception 'Classroom assignment review access denied' using errcode='42501';
  end if;

  return query
  select a.id, st.id, st.first_name, st.last_name, st.student_number,
         s.id, (s.id is not null), s.submitted_at, s.body, s.review_status,
         s.score, s.feedback
  from public.assignments a
  join public.virtual_classrooms vc
    on vc.id=a.classroom_id and vc.institution_id=a.institution_id
  join public.enrollments e
    on e.institution_id=vc.institution_id
   and e.division_id=vc.division_id
   and e.status='active'
   and (e.enrolled_on is null or e.enrolled_on<=current_date)
   and (e.ended_on is null or e.ended_on>=current_date)
  join public.students st
    on st.id=e.student_id and st.institution_id=e.institution_id
   and st.status='active'
  left join public.submissions s
    on s.assignment_id=a.id and s.institution_id=a.institution_id
   and s.student_id=st.id
  where a.classroom_id=p_classroom_id
    and a.institution_id=v_institution_id
    and a.published_at is not null
  order by a.created_at desc, st.last_name, st.first_name;
end;
$$;

create or replace function public.list_classroom_assignment_roster(p_classroom_id uuid)
returns table(
  assignment_id uuid,
  student_id uuid,
  student_first_name text,
  student_last_name text,
  student_number text,
  submission_id uuid,
  submitted boolean,
  submitted_at timestamptz,
  body text,
  review_status text,
  score numeric,
  feedback text
)
language sql
stable
security invoker
set search_path=''
as $$
  select * from private.list_classroom_assignment_roster_impl(p_classroom_id);
$$;

create or replace function private.set_classroom_submission_review_status_impl(
  p_submission_id uuid,
  p_review_status text
)
returns uuid
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_institution_id uuid;
  v_old_status text;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if p_review_status is not null
     and p_review_status not in ('visto','aprobado','desaprobado','corregir') then
    raise exception 'Estado de revisión inválido' using errcode='22023';
  end if;

  select s.institution_id,s.review_status
    into v_institution_id,v_old_status
  from public.submissions s
  where s.id=p_submission_id
  for update;

  if v_institution_id is null
     or not private.can_access_submission(p_submission_id,v_institution_id,'classroom.grade') then
    raise exception 'Submission review access denied' using errcode='42501';
  end if;

  update public.submissions
     set review_status=p_review_status
   where id=p_submission_id and institution_id=v_institution_id;

  if v_old_status is distinct from p_review_status then
    insert into private.classroom_submission_review_events(
      institution_id,submission_id,actor_user_id,old_status,new_status
    ) values (
      v_institution_id,p_submission_id,v_user_id,v_old_status,p_review_status
    );
  end if;

  return p_submission_id;
end;
$$;

create or replace function public.set_classroom_submission_review_status(
  p_submission_id uuid,
  p_review_status text
)
returns uuid
language sql
volatile
security invoker
set search_path=''
as $$
  select private.set_classroom_submission_review_status_impl(p_submission_id,p_review_status);
$$;

revoke all on function public.list_classroom_assignment_roster(uuid) from public,anon;
revoke all on function public.set_classroom_submission_review_status(uuid,text) from public,anon;
grant execute on function public.list_classroom_assignment_roster(uuid) to authenticated;
grant execute on function public.set_classroom_submission_review_status(uuid,text) to authenticated;
