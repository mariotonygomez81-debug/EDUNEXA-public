create or replace function private.has_current_conversation_access(
  p_institution_id uuid,
  p_conversation_id uuid,
  p_membership_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_counterpart_membership_id uuid;
begin
  if (select auth.uid()) is null
    or p_institution_id is null
    or p_conversation_id is null
    or p_membership_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.id=p_membership_id
      and m.institution_id=p_institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  ) then
    return false;
  end if;

  if (
    select count(*)
    from public.conversation_members cm
    where cm.conversation_id=p_conversation_id
      and cm.institution_id=p_institution_id
  ) <> 2 then
    return false;
  end if;

  select cm.membership_id into v_counterpart_membership_id
  from public.conversation_members cm
  join public.memberships counterpart
    on counterpart.id=cm.membership_id
    and counterpart.institution_id=cm.institution_id
  where cm.conversation_id=p_conversation_id
    and cm.institution_id=p_institution_id
    and cm.membership_id<>p_membership_id
    and counterpart.status='active'
  limit 1;

  if v_counterpart_membership_id is null then
    return false;
  end if;

  return private.can_message_members(
    p_institution_id,p_membership_id,v_counterpart_membership_id
  );
end;
$function$;

revoke all on function private.has_current_conversation_access(uuid,uuid,uuid) from public,anon;
grant execute on function private.has_current_conversation_access(uuid,uuid,uuid) to authenticated;

create or replace function private.list_conversation_messages_impl(
  p_institution_id uuid,
  p_conversation_id uuid,
  p_limit integer default 50
)
returns table(
  id uuid,
  sender_membership_id uuid,
  sender_name text,
  body text,
  sent_at timestamptz,
  read_at timestamptz,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;

  if v_membership_id is null
    or not private.has_current_conversation_access(
      p_institution_id,p_conversation_id,v_membership_id
    ) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;

  return query
  select
    latest.id,
    latest.sender_membership_id,
    coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Usuario escolar'
    ),
    latest.body,
    latest.sent_at,
    latest.read_at,
    latest.sender_membership_id=v_membership_id
  from (
    select m.id,m.sender_membership_id,m.body,m.sent_at,m.read_at
    from public.messages m
    where m.institution_id=p_institution_id
      and m.conversation_id=p_conversation_id
    order by m.sent_at desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  ) latest
  join public.memberships sender
    on sender.id=latest.sender_membership_id
    and sender.institution_id=p_institution_id
  left join public.profiles p on p.id=sender.user_id
  order by latest.sent_at asc;
end;
$function$;

create or replace function private.list_my_conversations_impl(p_institution_id uuid)
returns table(
  conversation_id uuid,
  subject text,
  counterpart_membership_id uuid,
  counterpart_name text,
  counterpart_role_keys text[],
  last_message_body text,
  last_message_at timestamptz,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;

  if v_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;

  return query
  select
    c.id,
    c.subject,
    other_member.membership_id,
    coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Usuario escolar'
    ),
    coalesce(role_data.role_keys,array[]::text[]),
    latest.body,
    latest.sent_at,
    coalesce(unread.unread_count,0)::bigint
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id=c.id and mine.institution_id=c.institution_id
  join lateral (
    select cm.membership_id
    from public.conversation_members cm
    where cm.conversation_id=c.id
      and cm.institution_id=c.institution_id
      and cm.membership_id<>v_membership_id
    order by cm.joined_at
    limit 1
  ) other_member on true
  join public.memberships counterpart
    on counterpart.id=other_member.membership_id
    and counterpart.institution_id=c.institution_id
    and counterpart.status='active'
  left join public.profiles p on p.id=counterpart.user_id
  left join lateral (
    select array_agg(distinct r.key order by r.key) as role_keys
    from public.membership_roles mr
    join public.roles r on r.id=mr.role_id
    where mr.membership_id=counterpart.id
      and mr.institution_id=counterpart.institution_id
  ) role_data on true
  left join lateral (
    select m.body,m.sent_at
    from public.messages m
    where m.conversation_id=c.id
      and m.institution_id=c.institution_id
    order by m.sent_at desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.conversation_id=c.id
      and m.institution_id=c.institution_id
      and m.sender_membership_id<>v_membership_id
      and m.read_at is null
  ) unread on true
  where c.institution_id=p_institution_id
    and mine.membership_id=v_membership_id
    and private.has_current_conversation_access(
      p_institution_id,c.id,v_membership_id
    )
  order by coalesce(latest.sent_at,c.created_at) desc
  limit 100;
end;
$function$;

create or replace function private.mark_conversation_read_impl(
  p_institution_id uuid,
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;

  if v_membership_id is null
    or not private.has_current_conversation_access(
      p_institution_id,p_conversation_id,v_membership_id
    ) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;

  update public.messages
  set read_at=coalesce(read_at,now())
  where institution_id=p_institution_id
    and conversation_id=p_conversation_id
    and sender_membership_id<>v_membership_id
    and read_at is null;
  get diagnostics v_count=row_count;

  update public.notifications
  set read_at=coalesce(read_at,now())
  where institution_id=p_institution_id
    and recipient_membership_id=v_membership_id
    and notification_type='message'
    and resource_type='conversation'
    and resource_id=p_conversation_id;

  return v_count;
end;
$function$;

create or replace function private.send_conversation_message_impl(
  p_institution_id uuid,
  p_conversation_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_message_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 5000 then
    raise exception 'Message body must contain 1 to 5000 characters' using errcode='22023';
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;

  if v_membership_id is null
    or not private.has_current_conversation_access(
      p_institution_id,p_conversation_id,v_membership_id
    ) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;

  insert into public.messages(institution_id,conversation_id,sender_membership_id,body)
  values(p_institution_id,p_conversation_id,v_membership_id,btrim(p_body))
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read
on public.notifications
for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.id=notifications.recipient_membership_id
      and m.institution_id=notifications.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
  and (
    notifications.notification_type<>'message'
    or private.has_current_conversation_access(
      notifications.institution_id,
      notifications.resource_id,
      notifications.recipient_membership_id
    )
  )
);
