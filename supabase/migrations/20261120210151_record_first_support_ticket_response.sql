-- Record the first public response by an authorized institutional support administrator.

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

  return new;
end;
$function$;

create or replace function private.record_first_support_ticket_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.is_internal = false
     and exists (
       select 1
       from public.memberships m
       where m.id = new.author_membership_id
         and m.institution_id = new.institution_id
         and m.user_id = (select auth.uid())
         and m.status = 'active'
         and private.has_institution_permission(m.institution_id, 'support.manage')
     )
  then
    update public.support_tickets
    set first_response_at = coalesce(first_response_at, pg_catalog.now())
    where id = new.ticket_id
      and institution_id = new.institution_id
      and first_response_at is null;
  end if;

  return new;
end;
$function$;

revoke all on function private.record_first_support_ticket_response() from public, anon, authenticated;

drop trigger if exists support_ticket_first_response_recorded on public.support_ticket_messages;
create trigger support_ticket_first_response_recorded
after insert on public.support_ticket_messages
for each row execute function private.record_first_support_ticket_response();