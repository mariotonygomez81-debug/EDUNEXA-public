-- Administrative records and internal procedures for the institution's administrative staff.
create table if not exists public.administrative_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  created_by_membership_id uuid not null references public.memberships(id) on delete restrict,
  updated_by_membership_id uuid references public.memberships(id) on delete set null,
  category text not null check (category in ('documentacion','tramites','personal','compras','mantenimiento','inventario','otro')),
  record_code text check (record_code is null or char_length(btrim(record_code)) between 1 and 50),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  record_date date not null default current_date,
  due_date date,
  resolution_notes text check (resolution_notes is null or char_length(resolution_notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint administrative_records_due_date_check check (due_date is null or due_date >= record_date)
);

create index if not exists administrative_records_scope_status_date_idx
  on public.administrative_records(institution_id,status,record_date desc);
create index if not exists administrative_records_scope_category_idx
  on public.administrative_records(institution_id,category,record_date desc);
create unique index if not exists administrative_records_scope_code_unique
  on public.administrative_records(institution_id,lower(record_code))
  where record_code is not null;

alter table public.administrative_records enable row level security;
revoke all on public.administrative_records from anon,authenticated;
grant select on public.administrative_records to authenticated;
grant insert(institution_id,created_by_membership_id,category,record_code,title,description,status,record_date,due_date)
  on public.administrative_records to authenticated;
grant update(updated_by_membership_id,category,record_code,title,description,status,record_date,due_date,resolution_notes,updated_at)
  on public.administrative_records to authenticated;

insert into public.permissions(key,description)
values
 ('administrative_records.read','Read institutional administrative records'),
 ('administrative_records.manage','Create and manage institutional administrative records')
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
cross join public.permissions p
where r.key in ('institution_admin','administrative')
  and p.key in ('administrative_records.read','administrative_records.manage')
on conflict do nothing;

drop policy if exists administrative_records_scoped_read on public.administrative_records;
create policy administrative_records_scoped_read on public.administrative_records
for select to authenticated
using (private.has_institution_permission(institution_id,'administrative_records.read'));

drop policy if exists administrative_records_scoped_insert on public.administrative_records;
create policy administrative_records_scoped_insert on public.administrative_records
for insert to authenticated
with check (
  private.has_institution_permission(institution_id,'administrative_records.manage')
  and exists (
    select 1 from public.memberships m
    where m.id=administrative_records.created_by_membership_id
      and m.institution_id=administrative_records.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

drop policy if exists administrative_records_scoped_update on public.administrative_records;
create policy administrative_records_scoped_update on public.administrative_records
for update to authenticated
using (private.has_institution_permission(institution_id,'administrative_records.manage'))
with check (
  private.has_institution_permission(institution_id,'administrative_records.manage')
  and exists (
    select 1 from public.memberships m
    where m.id=administrative_records.updated_by_membership_id
      and m.institution_id=administrative_records.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

create or replace function private.set_administrative_record_updated_at()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  new.updated_at=now();
  return new;
end;
$function$;

drop trigger if exists administrative_records_set_updated_at on public.administrative_records;
create trigger administrative_records_set_updated_at
before update on public.administrative_records
for each row execute function private.set_administrative_record_updated_at();
