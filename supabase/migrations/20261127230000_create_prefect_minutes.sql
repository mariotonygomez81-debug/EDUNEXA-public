-- Append-only prefect minutes with a durable snapshot of the linked novelty.
create table if not exists public.prefect_minutes (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity unique,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  division_id uuid not null,
  student_id uuid,
  meeting_date date not null default current_date,
  act_type text not null check (act_type in ('seguimiento','convivencia','reunion_familiar','acuerdo','intervencion')),
  subject text not null check (char_length(btrim(subject)) between 3 and 180),
  participants text not null default '' check (char_length(participants) <= 2000),
  development text not null check (char_length(btrim(development)) between 1 and 6000),
  agreements text not null default '' check (char_length(agreements) <= 4000),
  related_novelty_id uuid references public.prefect_novelties(id) on delete set null,
  source_novelty_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_novelty_snapshot) = 'object'),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  constraint prefect_minutes_division_fk
    foreign key (division_id,institution_id)
    references public.divisions(id,institution_id) on delete cascade,
  constraint prefect_minutes_student_fk
    foreign key (student_id,institution_id)
    references public.students(id,institution_id) on delete restrict,
  constraint prefect_minutes_author_fk
    foreign key (created_by_membership_id,institution_id)
    references public.memberships(id,institution_id) on delete restrict
);

create index if not exists prefect_minutes_scope_date_idx
  on public.prefect_minutes(institution_id,division_id,meeting_date desc,folio desc);
create index if not exists prefect_minutes_student_idx
  on public.prefect_minutes(institution_id,student_id,meeting_date desc)
  where student_id is not null;

alter table public.prefect_minutes enable row level security;
revoke all on public.prefect_minutes from public,anon,authenticated;
grant select on public.prefect_minutes to authenticated;
grant insert(
  institution_id,division_id,student_id,meeting_date,act_type,subject,
  participants,development,agreements,related_novelty_id,
  source_novelty_snapshot,created_by_membership_id
) on public.prefect_minutes to authenticated;

insert into public.permissions(key,description)
values ('prefect_minutes.manage','Create and read append-only minutes within assigned institutional divisions')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r cross join public.permissions p
where r.key in ('institution_admin','prefect')
  and p.key='prefect_minutes.manage'
on conflict do nothing;

drop policy if exists prefect_minutes_scoped_read on public.prefect_minutes;
create policy prefect_minutes_scoped_read on public.prefect_minutes
for select to authenticated
using (
  private.can_manage_division(division_id,institution_id,'prefect_minutes.manage')
);

drop policy if exists prefect_minutes_scoped_insert on public.prefect_minutes;
create policy prefect_minutes_scoped_insert on public.prefect_minutes
for insert to authenticated
with check (
  private.can_manage_division(division_id,institution_id,'prefect_minutes.manage')
  and exists (
    select 1 from public.memberships m
    where m.id=prefect_minutes.created_by_membership_id
      and m.institution_id=prefect_minutes.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
  and (
    student_id is null
    or exists (
      select 1 from public.enrollments e
      where e.institution_id=prefect_minutes.institution_id
        and e.division_id=prefect_minutes.division_id
        and e.student_id=prefect_minutes.student_id
        and e.status='active'
        and e.enrolled_on<=prefect_minutes.meeting_date
        and (e.ended_on is null or e.ended_on>=prefect_minutes.meeting_date)
    )
  )
  and (
    related_novelty_id is null
    or exists (
      select 1 from public.prefect_novelties n
      where n.id=prefect_minutes.related_novelty_id
        and n.institution_id=prefect_minutes.institution_id
        and n.division_id=prefect_minutes.division_id
        and (n.student_id is null or student_id is null or n.student_id=prefect_minutes.student_id)
    )
  )
);
