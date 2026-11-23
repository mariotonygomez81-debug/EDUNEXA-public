-- Keep ticket replies unavailable after the requester or school administrator resolves/closes a ticket.
drop policy if exists support_ticket_messages_insert_visible on public.support_ticket_messages;

create policy support_ticket_messages_insert_visible
on public.support_ticket_messages
for insert to authenticated
with check (
  is_internal = false
  and author_kind = 'school_user'
  and exists (
    select 1
    from public.memberships author
    join public.support_tickets t
      on t.id = support_ticket_messages.ticket_id
     and t.institution_id = support_ticket_messages.institution_id
    where author.id = support_ticket_messages.author_membership_id
      and author.institution_id = support_ticket_messages.institution_id
      and author.user_id = (select auth.uid())
      and author.status = 'active'
      and t.status not in ('resolved','closed')
      and (
        t.created_by_membership_id = author.id
        or private.has_institution_permission(t.institution_id, 'support.manage')
      )
  )
);
