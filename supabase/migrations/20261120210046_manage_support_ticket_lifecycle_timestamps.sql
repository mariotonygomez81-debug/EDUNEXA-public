-- Keep ticket lifecycle timestamps under database control, not client input.

create or replace function private.manage_support_ticket_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();

  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_at := coalesce(old.resolved_at, pg_catalog.now());
      new.closed_at := null;
    elsif new.status = 'closed' then
      new.closed_at := coalesce(old.closed_at, pg_catalog.now());
      if old.status <> 'resolved' then
        new.resolved_at := coalesce(old.resolved_at, pg_catalog.now());
      end if;
    elsif new.status = 'reopened' then
      new.resolved_at := null;
      new.closed_at := null;
    end if;
  end if;

  -- These values are never accepted from client-supplied UPDATE payloads.
  new.first_response_at := old.first_response_at;
  return new;
end;
$function$;

revoke all on function private.manage_support_ticket_lifecycle() from public, anon, authenticated;

drop trigger if exists support_ticket_lifecycle_managed on public.support_tickets;
create trigger support_ticket_lifecycle_managed
before update on public.support_tickets
for each row execute function private.manage_support_ticket_lifecycle();

revoke update (first_response_at, resolved_at, closed_at, updated_at)
  on public.support_tickets from authenticated;
grant update (status, priority) on public.support_tickets to authenticated;
