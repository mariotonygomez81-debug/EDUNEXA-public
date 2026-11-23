-- Controlled client access for the first support-ticket workflows.
-- Attachments, events and global escalations remain closed pending their dedicated services.

CREATE POLICY support_tickets_select_own_or_admin
ON public.support_tickets
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = support_tickets.created_by_membership_id
      AND m.institution_id = support_tickets.institution_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
  )
  OR private.has_institution_permission(institution_id, 'support.read')
  OR private.has_institution_permission(institution_id, 'support.manage')
);

CREATE POLICY support_tickets_insert_as_active_member
ON public.support_tickets
FOR INSERT TO authenticated
WITH CHECK (
  private.has_institution_permission(institution_id, 'support.create')
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = support_tickets.created_by_membership_id
      AND m.institution_id = support_tickets.institution_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
  )
  AND assigned_to_membership_id IS NULL
  AND status = 'open'
);

CREATE POLICY support_tickets_update_by_school_admin
ON public.support_tickets
FOR UPDATE TO authenticated
USING (
  private.has_institution_permission(institution_id, 'support.manage')
)
WITH CHECK (
  private.has_institution_permission(institution_id, 'support.manage')
);

CREATE POLICY support_ticket_messages_select_visible
ON public.support_ticket_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.institution_id = support_ticket_messages.institution_id
      AND (
        (
          support_ticket_messages.is_internal = false
          AND EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.id = t.created_by_membership_id
              AND m.institution_id = t.institution_id
              AND m.user_id = (SELECT auth.uid())
              AND m.status = 'active'
          )
        )
        OR private.has_institution_permission(t.institution_id, 'support.manage')
      )
  )
);

CREATE POLICY support_ticket_messages_insert_visible
ON public.support_ticket_messages
FOR INSERT TO authenticated
WITH CHECK (
  is_internal = false
  AND author_kind = 'school_user'
  AND EXISTS (
    SELECT 1
    FROM public.memberships author
    JOIN public.support_tickets t
      ON t.id = support_ticket_messages.ticket_id
     AND t.institution_id = support_ticket_messages.institution_id
    WHERE author.id = support_ticket_messages.author_membership_id
      AND author.institution_id = support_ticket_messages.institution_id
      AND author.user_id = (SELECT auth.uid())
      AND author.status = 'active'
      AND (
        t.created_by_membership_id = author.id
        OR private.has_institution_permission(t.institution_id, 'support.manage')
      )
  )
);
