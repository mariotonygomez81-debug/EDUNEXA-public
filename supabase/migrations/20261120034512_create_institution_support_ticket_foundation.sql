-- PIE support tickets: additive foundation only.
-- Client access remains explicitly denied until granular authorization is tested.
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  created_by_membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  assigned_to_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 180),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 10000),
  module_key text,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug','access','data','performance','question','other')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','triaged','in_progress','waiting_user','escalated','global_in_progress','resolved','closed','reopened')),
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_membership_id uuid REFERENCES public.memberships(id) ON DELETE RESTRICT,
  author_kind text NOT NULL DEFAULT 'school_user'
    CHECK (author_kind IN ('school_user','institution_admin','pie_support','system')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  uploaded_by_membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  storage_bucket text NOT NULL DEFAULT 'support-private',
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_membership_id uuid REFERENCES public.memberships(id) ON DELETE RESTRICT,
  event_key text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_ticket_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  escalated_by_membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 4000),
  sanitized_summary text NOT NULL CHECK (length(btrim(sanitized_summary)) BETWEEN 10 AND 8000),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','accepted','in_progress','waiting_school','resolved','rejected')),
  pie_case_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_institution_status_created_idx
  ON public.support_tickets (institution_id, status, created_at DESC);
CREATE INDEX support_tickets_requester_created_idx
  ON public.support_tickets (created_by_membership_id, created_at DESC);
CREATE INDEX support_tickets_assignee_status_idx
  ON public.support_tickets (assigned_to_membership_id, status);
CREATE INDEX support_ticket_messages_ticket_created_idx
  ON public.support_ticket_messages (ticket_id, created_at);
CREATE INDEX support_ticket_attachments_ticket_idx
  ON public.support_ticket_attachments (ticket_id);
CREATE INDEX support_ticket_events_ticket_created_idx
  ON public.support_ticket_events (ticket_id, created_at);
CREATE INDEX support_ticket_escalations_institution_status_idx
  ON public.support_ticket_escalations (institution_id, status, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_deny_client
  ON public.support_tickets FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY support_ticket_messages_deny_client
  ON public.support_ticket_messages FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY support_ticket_attachments_deny_client
  ON public.support_ticket_attachments FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY support_ticket_events_deny_client
  ON public.support_ticket_events FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY support_ticket_escalations_deny_client
  ON public.support_ticket_escalations FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE
  public.support_tickets,
  public.support_ticket_messages,
  public.support_ticket_attachments,
  public.support_ticket_events,
  public.support_ticket_escalations
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.support_tickets,
  public.support_ticket_messages,
  public.support_ticket_attachments,
  public.support_ticket_events,
  public.support_ticket_escalations
TO authenticated;

GRANT ALL ON TABLE
  public.support_tickets,
  public.support_ticket_messages,
  public.support_ticket_attachments,
  public.support_ticket_events,
  public.support_ticket_escalations
TO service_role;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.support_tickets,
  public.support_ticket_messages,
  public.support_ticket_attachments,
  public.support_ticket_events,
  public.support_ticket_escalations
FROM authenticated;
