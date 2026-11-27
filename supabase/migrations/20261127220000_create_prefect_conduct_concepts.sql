-- Individual conduct concepts for students, scoped to each prefect's assigned divisions.
create table if not exists public.prefect_conduct_concepts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  division_id uuid not null,
  student_id uuid not null,
  grading_period_id uuid not null,
  concept text not null check (concept in ('muy_satisfactorio','satisfactorio','en_proceso','requiere_acompanamiento')),
  observation text check (observation is null or char_length(observation) <= 1200),
  recorded_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prefect_conduct_division_fk foreign key (division_id,institution_id)
    references public.divisions(id,institution_id) on delete cascade,
  constraint prefect_conduct_student_fk foreign key (student_id,institution_id)
    references public.students(id,institution_id) on delete restrict,
  constraint prefect_conduct_period_fk foreign key (grading_period_id,institution_id)
    references public.grading_periods(id,institution_id) on delete restrict,
  constraint prefect_conduct_author_fk foreign key (recorded_by_membership_id,institution_id)
    references public.memberships(id,institution_id) on delete restrict,
  constraint prefect_conduct_one_per_student_period unique (institution_id,student_id,grading_period_id)
);
create index if not exists prefect_conduct_division_period_idx
  on public.prefect_conduct_concepts(institution_id,division_id,grading_period_id,updated_at desc);
create index if not exists prefect_conduct_student_history_idx
  on public.prefect_conduct_concepts(institution_id,student_id,updated_at desc);

alter table public.prefect_conduct_concepts enable row level security;
revoke all on public.prefect_conduct_concepts from public,anon,authenticated;
grant select,insert,update on public.prefect_conduct_concepts to authenticated;

insert into public.permissions(key,description)
values ('prefect_conduct.manage','Register and update student conduct concepts within assigned institutional divisions')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('prefect','institution_admin','director') and p.key='prefect_conduct.manage'
on conflict do nothing;

drop policy if exists prefect_conduct_scoped_read on public.prefect_conduct_concepts;
create policy prefect_conduct_scoped_read on public.prefect_conduct_concepts
for select to authenticated
using (private.can_manage_division(division_id,institution_id,'prefect_conduct.manage'));

drop policy if exists prefect_conduct_scoped_insert on public.prefect_conduct_concepts;
create policy prefect_conduct_scoped_insert on public.prefect_conduct_concepts
for insert to authenticated
with check (
  private.can_manage_division(division_id,institution_id,'prefect_conduct.manage')
  and exists (
    select 1 from public.memberships m
    where m.id=prefect_conduct_concepts.recorded_by_membership_id
      and m.institution_id=prefect_conduct_concepts.institution_id
      and m.user_id=(select auth.uid()) and m.status='active'
  )
  and exists (
    select 1 from public.enrollments e
    join public.grading_periods gp on gp.id=prefect_conduct_concepts.grading_period_id
      and gp.institution_id=e.institution_id
    where e.institution_id=prefect_conduct_concepts.institution_id
      and e.division_id=prefect_conduct_concepts.division_id
      and e.student_id=prefect_conduct_concepts.student_id
      and e.enrolled_on<=gp.ends_on and (e.ended_on is null or e.ended_on>=gp.starts_on)
      and gp.status='open'
  )
);

drop policy if exists prefect_conduct_scoped_update on public.prefect_conduct_concepts;
create policy prefect_conduct_scoped_update on public.prefect_conduct_concepts
for update to authenticated
using (private.can_manage_division(division_id,institution_id,'prefect_conduct.manage'))
with check (
  private.can_manage_division(division_id,institution_id,'prefect_conduct.manage')
  and exists (
    select 1 from public.memberships m
    where m.id=prefect_conduct_concepts.recorded_by_membership_id
      and m.institution_id=prefect_conduct_concepts.institution_id
      and m.user_id=(select auth.uid()) and m.status='active'
  )
  and exists (
    select 1 from public.enrollments e
    join public.grading_periods gp on gp.id=prefect_conduct_concepts.grading_period_id
      and gp.institution_id=e.institution_id
    where e.institution_id=prefect_conduct_concepts.institution_id
      and e.division_id=prefect_conduct_concepts.division_id
      and e.student_id=prefect_conduct_concepts.student_id
      and e.enrolled_on<=gp.ends_on and (e.ended_on is null or e.ended_on>=gp.starts_on)
      and gp.status='open'
  )
);

create or replace function private.set_prefect_conduct_concept_updated_at()
returns trigger language plpgsql set search_path=''
as $function$
begin
  new.updated_at=now();
  return new;
end;
$function$;
revoke all on function private.set_prefect_conduct_concept_updated_at() from public,anon,authenticated;
drop trigger if exists prefect_conduct_concepts_set_updated_at on public.prefect_conduct_concepts;
create trigger prefect_conduct_concepts_set_updated_at
before update on public.prefect_conduct_concepts
for each row execute function private.set_prefect_conduct_concept_updated_at();
