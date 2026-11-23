create table if not exists public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text,
  display_mode text not null default 'numeric'
    check (display_mode in ('numeric','descriptive','both')),
  minimum_value numeric(8,2) not null default 1,
  maximum_value numeric(8,2) not null default 10,
  passing_value numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grading_scales_range_check check (maximum_value > minimum_value),
  constraint grading_scales_passing_check
    check (passing_value is null or (passing_value >= minimum_value and passing_value <= maximum_value)),
  constraint grading_scales_id_institution_key unique (id,institution_id),
  constraint grading_scales_institution_name_key unique (institution_id,name)
);

create table if not exists public.grading_scale_levels (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  grading_scale_id uuid not null,
  minimum_percentage numeric(5,2) not null,
  maximum_percentage numeric(5,2) not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  grade_value numeric(8,2),
  is_passing boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint grading_scale_levels_range_check
    check (minimum_percentage >= 0 and maximum_percentage <= 100 and maximum_percentage >= minimum_percentage),
  constraint grading_scale_levels_order_check check (sort_order between 0 and 1000),
  constraint grading_scale_levels_scale_fk
    foreign key (grading_scale_id,institution_id)
    references public.grading_scales(id,institution_id) on delete cascade,
  constraint grading_scale_levels_id_institution_key unique (id,institution_id)
);

alter table public.academic_years add column if not exists grading_scale_id uuid;
alter table public.academic_years drop constraint if exists academic_years_grading_scale_fk;
alter table public.academic_years add constraint academic_years_grading_scale_fk
  foreign key (grading_scale_id,institution_id)
  references public.grading_scales(id,institution_id) on delete restrict;

create index if not exists grading_scales_institution_idx on public.grading_scales(institution_id,name);
create index if not exists grading_scale_levels_scale_idx on public.grading_scale_levels(institution_id,grading_scale_id,sort_order);
create index if not exists academic_years_grading_scale_idx on public.academic_years(institution_id,grading_scale_id);

alter table public.grading_scales enable row level security;
alter table public.grading_scale_levels enable row level security;
revoke all on public.grading_scales from anon, authenticated;
revoke all on public.grading_scale_levels from anon, authenticated;
grant select, insert, update, delete on public.grading_scales to authenticated;
grant select, insert, update, delete on public.grading_scale_levels to authenticated;

drop policy if exists grading_scales_member_read on public.grading_scales;
create policy grading_scales_member_read on public.grading_scales for select to authenticated
using (exists (select 1 from public.memberships m where m.institution_id=grading_scales.institution_id and m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists grading_scales_manage on public.grading_scales;
create policy grading_scales_manage on public.grading_scales for all to authenticated
using (private.has_institution_permission(institution_id,'institution.manage'))
with check (private.has_institution_permission(institution_id,'institution.manage'));

drop policy if exists grading_scale_levels_member_read on public.grading_scale_levels;
create policy grading_scale_levels_member_read on public.grading_scale_levels for select to authenticated
using (exists (select 1 from public.memberships m where m.institution_id=grading_scale_levels.institution_id and m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists grading_scale_levels_manage on public.grading_scale_levels;
create policy grading_scale_levels_manage on public.grading_scale_levels for all to authenticated
using (private.has_institution_permission(institution_id,'institution.manage'))
with check (private.has_institution_permission(institution_id,'institution.manage'));
