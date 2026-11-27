-- Notify active assignees whenever an institutional support ticket assignment changes.
-- Uses the existing notifications inbox, support preference and append-only ticket event.

alter table public.notifications
  drop constraint if exists notifications_resource_type_check;
alter table public.notifications
  add constraint notifications_resource_type_check
  check (resource_type in ('announcement','conversation','grade','attendance','support_ticket','appointment','assignment','support_assignment'));

create or replace function private.notify_support_ticket_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_previous_assignee_membership_id uuid;
  v_new_assignee_membership_id uuid;
  v_ticket_title text;
begin
  if new.event_key <> 'assignment_changed' then
    return new;
  end if;

  v_previous_assignee_membership_id :=
    nullif(new.details->>'previous_assignee_membership_id','')::uuid;
  v_new_assignee_membership_id :=
    nullif(new.details->>'new_assignee_membership_id','')::uuid;

  if v_previous_assignee_membership_id is not distinct from v_new_assignee_membership_id then
    return new;
  end if;

  select t.title into v_ticket_title
  from public.support_tickets t
  where t.id=new.ticket_id and t.institution_id=new.institution_id;

  if v_ticket_title is null then
    return new;
  end if;

  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  )
  select new.institution_id,recipient.membership_id,'support',
    recipient.notification_title,
    left(recipient.notification_body,500),
    'support_assignment',
    new.id
  from (
    select v_new_assignee_membership_id as membership_id,
      'Te asignaron un ticket de soporte'::text as notification_title,
      'El ticket «'||v_ticket_title||'» fue asignado a tu responsabilidad. Entrá a Soporte institucional para revisar la solicitud.'::text as notification_body
    where v_new_assignee_membership_id is not null
    union all
    select v_previous_assignee_membership_id,
      case when v_new_assignee_membership_id is null
        then 'Retiraron un ticket de tu responsabilidad'
        else 'Reasignaron un ticket de soporte'
      end,
      case when v_new_assignee_membership_id is null
        then 'El ticket «'||v_ticket_title||'» dejó de estar asignado a tu cuenta.'
        else 'El ticket «'||v_ticket_title||'» fue asignado a otra persona y ya no está a tu cargo.'
      end
    where v_previous_assignee_membership_id is not null
  ) recipient
  join public.memberships m
    on m.id=recipient.membership_id
    and m.institution_id=new.institution_id
    and m.status='active'
  where coalesce((
    select np.in_app_enabled
    from public.notification_preferences np
    where np.institution_id=new.institution_id
      and np.membership_id=recipient.membership_id
      and np.notification_type='support'
  ),true)
  on conflict (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
  do nothing;

  return new;
end;
$function$;

revoke all on function private.notify_support_ticket_assignment() from public,anon,authenticated;

drop trigger if exists support_ticket_assignment_notify on public.support_ticket_events;
create trigger support_ticket_assignment_notify
after insert on public.support_ticket_events
for each row
when (new.event_key='assignment_changed')
execute function private.notify_support_ticket_assignment();

comment on function private.notify_support_ticket_assignment() is
'Creates one in-app support notification per active previous/new assignee for each immutable assignment_changed ticket event, respecting the recipient support notification preference.';
