-- Minimize client table privileges for support data; RLS remains the row-level boundary.
REVOKE UPDATE, DELETE ON TABLE public.support_tickets FROM authenticated;
GRANT UPDATE (status, priority, first_response_at, resolved_at, closed_at, updated_at)
ON TABLE public.support_tickets TO authenticated;

REVOKE UPDATE, DELETE ON TABLE public.support_ticket_messages FROM authenticated;

REVOKE ALL ON TABLE
  public.support_ticket_attachments,
  public.support_ticket_events,
  public.support_ticket_escalations
FROM anon, authenticated;
