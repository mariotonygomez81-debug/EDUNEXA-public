-- Add a due date to each prefect follow-up action.
alter table public.prefect_novelties
  add column if not exists follow_up_due_on date;

grant update(follow_up_due_on)
  on public.prefect_novelties to authenticated;

create index if not exists prefect_novelties_follow_up_due_idx
  on public.prefect_novelties(institution_id,follow_up_due_on)
  where status in ('open','in_progress') and follow_up_due_on is not null;
