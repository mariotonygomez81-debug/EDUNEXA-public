alter table public.support_tickets
  add column if not exists steps_to_reproduce text,
  add column if not exists occurred_at timestamp without time zone;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.support_tickets'::regclass
      and conname='support_tickets_module_key_allowed'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_module_key_allowed
      check (
        module_key is null or module_key in (
          'students','attendance','grades','classroom','announcements',
          'calendar','users','reports','access','settings','other'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.support_tickets'::regclass
      and conname='support_tickets_steps_length'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_steps_length
      check (steps_to_reproduce is null or length(steps_to_reproduce)<=4000);
  end if;
end;
$block$;

comment on column public.support_tickets.occurred_at is
  'Local wall-clock date/time reported by the requester for the incident; no timezone conversion is implied.';
comment on column public.support_tickets.steps_to_reproduce is
  'Optional, non-sensitive steps to reproduce the reported issue.';
