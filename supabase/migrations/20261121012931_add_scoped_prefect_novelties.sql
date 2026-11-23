-- Scoped follow-up notes for the prefect workspace.
create table if not exists public.prefect_novelties (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  division_id uuid not null,
  student_id uuid,
  category text not null check (category in ('convivencia','asistencia','academica','familia','salud','otra')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  event_date date not null default current_date,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  follow_up text check (follow_up is null or char_length(follow_up) <= 3000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (division_id,institution_id)
    references public.divisions(id,institution_id) on delete cascade,
  foreign key (student_id,institution_id)
    references public.students(id,institution_id) on delete restrict
);

create index if not exists prefect_novelties_scope_date_idx
  on public.prefect_novelties(institution_id,division_id,event_date desc);

create index if not exists prefect_novelties_student_idx
  on public.prefect_novelties(institution_id,student_id)
  where student_id is not null;

alter table public.prefect_novelties enable row level security;
revoke all on public.prefect_novelties from anon,authenticated;
grant select on public.prefect_novelties to authenticated;
grant insert(institution_id,division_id,student_id,category,title,description,event_date,created_by)
  on public.prefect_novelties to authenticated;
grant update(status,follow_up,updated_at) on public.prefect_novelties to authenticated;

insert into public.permissions(key,description)
values ('prefect_notes.manage','Create and follow up prefect notes within assigned divisions')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r cross join public.permissions p
where r.key in ('institution_admin','prefect')
  and p.key='prefect_notes.manage'
on conflict do nothing;

drop policy if exists prefect_novelties_scoped_read on public.prefect_novelties;
create policy prefect_novelties_scoped_read on public.prefect_novelties
for select to authenticated
using (private.can_manage_division(division_id,institution_id,'prefect_notes.manage'));

drop policy if exists prefect_novelties_scoped_insert on public.prefect_novelties;
create policy prefect_novelties_scoped_insert on public.prefect_novelties
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and private.can_manage_division(division_id,institution_id,'prefect_notes.manage')
  and (
    student_id is null
    or exists (
      select 1 from public.enrollments e
      where e.institution_id=prefect_novelties.institution_id
        and e.division_id=prefect_novelties.division_id
        and e.student_id=prefect_novelties.student_id
        and e.status='active'
        and e.enrolled_on<=current_date
        and (e.ended_on is null or e.ended_on>=current_date)
    )
  )
);

drop policy if exists prefect_novelties_scoped_update on public.prefect_novelties;
create policy prefect_novelties_scoped_update on public.prefect_novelties
for update to authenticated
using (private.can_manage_division(division_id,institution_id,'prefect_notes.manage'))
with check (
  private.can_manage_division(division_id,institution_id,'prefect_notes.manage')
  and (
    student_id is null
    or exists (
      select 1 from public.enrollments e
      where e.institution_id=prefect_novelties.institution_id
        and e.division_id=prefect_novelties.division_id
        and e.student_id=prefect_novelties.student_id
        and e.status='active'
    )
  )
);

create or replace function private.set_prefect_novelty_updated_at()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  new.updated_at=now();
  return new;
end;
$function$;

drop trigger if exists prefect_novelties_set_updated_at on public.prefect_novelties;
create trigger prefect_novelties_set_updated_at
before update on public.prefect_novelties
for each row execute function private.set_prefect_novelty_updated_at();
