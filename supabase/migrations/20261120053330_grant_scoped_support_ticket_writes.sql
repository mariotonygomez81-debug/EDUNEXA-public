-- Restore the narrow client grants required by the ticket inbox and reply workflow.
-- Ticket creation remains restricted to approved columns by the subsequent ticket-column migration.
grant select on table public.support_tickets to authenticated;
grant select, insert on table public.support_ticket_messages to authenticated;
