-- Enforce tenant-local relationships for the school support module.
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_id_institution_id_key UNIQUE (id, institution_id);
ALTER TABLE public.support_ticket_messages
  ADD CONSTRAINT support_ticket_messages_id_institution_id_key UNIQUE (id, institution_id);

ALTER TABLE public.support_tickets
  DROP CONSTRAINT support_tickets_created_by_membership_id_fkey,
  DROP CONSTRAINT support_tickets_assigned_to_membership_id_fkey;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_created_by_membership_institution_fkey
    FOREIGN KEY (created_by_membership_id, institution_id)
    REFERENCES public.memberships (id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_tickets_assigned_membership_institution_fkey
    FOREIGN KEY (assigned_to_membership_id, institution_id)
    REFERENCES public.memberships (id, institution_id) ON DELETE RESTRICT;

ALTER TABLE public.support_ticket_messages
  DROP CONSTRAINT support_ticket_messages_author_membership_id_fkey,
  DROP CONSTRAINT support_ticket_messages_ticket_id_fkey;

ALTER TABLE public.support_ticket_messages
  ADD CONSTRAINT support_ticket_messages_author_membership_institution_fkey
    FOREIGN KEY (author_membership_id, institution_id)
    REFERENCES public.memberships (id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_ticket_messages_ticket_institution_fkey
    FOREIGN KEY (ticket_id, institution_id)
    REFERENCES public.support_tickets (id, institution_id) ON DELETE CASCADE;

ALTER TABLE public.support_ticket_attachments
  DROP CONSTRAINT support_ticket_attachments_uploaded_by_membership_id_fkey,
  DROP CONSTRAINT support_ticket_attachments_ticket_id_fkey,
  DROP CONSTRAINT support_ticket_attachments_message_id_fkey;

ALTER TABLE public.support_ticket_attachments
  ADD CONSTRAINT support_ticket_attachments_uploader_institution_fkey
    FOREIGN KEY (uploaded_by_membership_id, institution_id)
    REFERENCES public.memberships (id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_ticket_attachments_ticket_institution_fkey
    FOREIGN KEY (ticket_id, institution_id)
    REFERENCES public.support_tickets (id, institution_id) ON DELETE CASCADE,
  ADD CONSTRAINT support_ticket_attachments_message_institution_fkey
    FOREIGN KEY (message_id, institution_id)
    REFERENCES public.support_ticket_messages (id, institution_id) ON DELETE CASCADE;

ALTER TABLE public.support_ticket_events
  DROP CONSTRAINT support_ticket_events_actor_membership_id_fkey,
  DROP CONSTRAINT support_ticket_events_ticket_id_fkey;

ALTER TABLE public.support_ticket_events
  ADD CONSTRAINT support_ticket_events_actor_membership_institution_fkey
    FOREIGN KEY (actor_membership_id, institution_id)
    REFERENCES public.memberships (id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_ticket_events_ticket_institution_fkey
    FOREIGN KEY (ticket_id, institution_id)
    REFERENCES public.support_tickets (id, institution_id) ON DELETE CASCADE;

ALTER TABLE public.support_ticket_escalations
  DROP CONSTRAINT support_ticket_escalations_escalated_by_membership_id_fkey,
  DROP CONSTRAINT support_ticket_escalations_ticket_id_fkey;

ALTER TABLE public.support_ticket_escalations
  ADD CONSTRAINT support_ticket_escalations_actor_institution_fkey
    FOREIGN KEY (escalated_by_membership_id, institution_id)
    REFERENCES public.memberships (id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_ticket_escalations_ticket_institution_fkey
    FOREIGN KEY (ticket_id, institution_id)
    REFERENCES public.support_tickets (id, institution_id) ON DELETE CASCADE;
