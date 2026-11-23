drop index if exists public.notifications_recipient_inbox_idx;
drop index if exists public.notifications_recipient_unread_idx;

create index notifications_recipient_inbox_idx
  on public.notifications(recipient_membership_id,institution_id,created_at desc);

create index notifications_recipient_unread_idx
  on public.notifications(recipient_membership_id,institution_id,created_at desc)
  where read_at is null;

create index if not exists notification_preferences_membership_scope_idx
  on public.notification_preferences(membership_id,institution_id);
