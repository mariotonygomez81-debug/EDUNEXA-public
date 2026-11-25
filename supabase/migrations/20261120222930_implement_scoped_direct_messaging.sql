alter table public.conversations
  add constraint conversations_subject_length
  check (subject is null or length(btrim(subject))<=120);

alter table public.messages
  add constraint messages_body_length
  check (length(btrim(body)) between 1 and 5000);

CREATE OR REPLACE FUNCTION private.can_message_members(p_institution_id uuid, p_sender_membership_id uuid, p_recipient_membership_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sender_roles text[];
  v_recipient_roles text[];
  v_sender_admin boolean;
  v_sender_staff boolean;
  v_sender_student boolean;
  v_sender_guardian boolean;
  v_recipient_admin boolean;
  v_recipient_staff boolean;
  v_recipient_student boolean;
  v_recipient_guardian boolean;
begin
  if p_institution_id is null
    or p_sender_membership_id is null
    or p_recipient_membership_id is null
    or p_sender_membership_id=p_recipient_membership_id then
    return false;
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.id=p_sender_membership_id and m.institution_id=p_institution_id and m.status='active'
  ) or not exists (
    select 1 from public.memberships m
    where m.id=p_recipient_membership_id and m.institution_id=p_institution_id and m.status='active'
  ) then
    return false;
  end if;

  select coalesce(array_agg(r.key),array[]::text[])
    into v_sender_roles
  from public.membership_roles mr
  join public.roles r on r.id=mr.role_id
  where mr.membership_id=p_sender_membership_id and mr.institution_id=p_institution_id;

  select coalesce(array_agg(r.key),array[]::text[])
    into v_recipient_roles
  from public.membership_roles mr
  join public.roles r on r.id=mr.role_id
  where mr.membership_id=p_recipient_membership_id and mr.institution_id=p_institution_id;

  v_sender_admin:=v_sender_roles && array['institution_admin','director','administrative'];
  v_sender_staff:=v_sender_roles && array['teacher','prefect'];
  v_sender_student:='student'=any(v_sender_roles);
  v_sender_guardian:='guardian'=any(v_sender_roles);

  v_recipient_admin:=v_recipient_roles && array['institution_admin','director','administrative'];
  v_recipient_staff:=v_recipient_roles && array['teacher','prefect'];
  v_recipient_student:='student'=any(v_recipient_roles);
  v_recipient_guardian:='guardian'=any(v_recipient_roles);

  if v_sender_admin or v_recipient_admin then return true; end if;
  if v_sender_staff and v_recipient_staff then return true; end if;

  if v_sender_staff and (v_recipient_student or v_recipient_guardian) then
    return exists (
      select 1
      from public.enrollments e
      where e.institution_id=p_institution_id
        and e.status='active'
        and e.enrolled_on<=current_date
        and (e.ended_on is null or e.ended_on>=current_date)
        and (
          (v_recipient_student and exists (
            select 1 from public.student_memberships sm
            where sm.student_id=e.student_id
              and sm.membership_id=p_recipient_membership_id
              and sm.institution_id=p_institution_id
          ))
          or
          (v_recipient_guardian and exists (
            select 1
            from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id=g.id and sg.institution_id=g.institution_id
            where g.membership_id=p_recipient_membership_id
              and g.institution_id=p_institution_id
              and sg.student_id=e.student_id
          ))
        )
        and private.is_staff_assigned_to_division(
          p_sender_membership_id,p_institution_id,e.division_id
        )
    );
  end if;

  if (v_sender_student or v_sender_guardian) and v_recipient_staff then
    return exists (
      select 1
      from public.enrollments e
      where e.institution_id=p_institution_id
        and e.status='active'
        and e.enrolled_on<=current_date
        and (e.ended_on is null or e.ended_on>=current_date)
        and (
          (v_sender_student and exists (
            select 1 from public.student_memberships sm
            where sm.student_id=e.student_id
              and sm.membership_id=p_sender_membership_id
              and sm.institution_id=p_institution_id
          ))
          or
          (v_sender_guardian and exists (
            select 1
            from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id=g.id and sg.institution_id=g.institution_id
            where g.membership_id=p_sender_membership_id
              and g.institution_id=p_institution_id
              and sg.student_id=e.student_id
          ))
        )
        and private.is_staff_assigned_to_division(
          p_recipient_membership_id,p_institution_id,e.division_id
        )
    );
  end if;

  return false;
end;
$function$;


CREATE OR REPLACE FUNCTION private.create_direct_conversation_impl(p_institution_id uuid, p_recipient_membership_id uuid, p_subject text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sender_membership_id uuid;
  v_conversation_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_institution_id is null
    or p_recipient_membership_id is null
    or (p_subject is not null and length(btrim(p_subject))>120) then
    raise exception 'Invalid conversation data' using errcode='22023';
  end if;

  select m.id into v_sender_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;
  if v_sender_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;
  if not private.can_message_members(
    p_institution_id,v_sender_membership_id,p_recipient_membership_id
  ) then
    raise exception 'Recipient is outside your authorized messaging scope' using errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_institution_id::text||':'||
      least(v_sender_membership_id::text,p_recipient_membership_id::text)||':'||
      greatest(v_sender_membership_id::text,p_recipient_membership_id::text),
      0
    )
  );

  select c.id into v_conversation_id
  from public.conversations c
  where c.institution_id=p_institution_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id=c.id and cm.institution_id=c.institution_id
        and cm.membership_id=v_sender_membership_id
    )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id=c.id and cm.institution_id=c.institution_id
        and cm.membership_id=p_recipient_membership_id
    )
    and (
      select count(*) from public.conversation_members cm
      where cm.conversation_id=c.id and cm.institution_id=c.institution_id
    )=2
  order by c.created_at desc
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations(institution_id,subject,created_by)
  values (p_institution_id,nullif(btrim(p_subject),''),(select auth.uid()))
  returning id into v_conversation_id;

  insert into public.conversation_members(conversation_id,institution_id,membership_id)
  values
    (v_conversation_id,p_institution_id,v_sender_membership_id),
    (v_conversation_id,p_institution_id,p_recipient_membership_id);

  return v_conversation_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.fanout_message_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  )
  select
    new.institution_id,
    cm.membership_id,
    'message',
    'Nuevo mensaje',
    left(new.body,500),
    'conversation',
    new.conversation_id
  from public.conversation_members cm
  join public.memberships m
    on m.id=cm.membership_id and m.institution_id=cm.institution_id
  where cm.conversation_id=new.conversation_id
    and cm.institution_id=new.institution_id
    and cm.membership_id<>new.sender_membership_id
    and m.status='active'
    and not exists (
      select 1 from public.guardians g
      where g.membership_id=m.id
        and g.institution_id=m.institution_id
        and g.receives_notifications=false
    )
    and coalesce((
      select np.in_app_enabled
      from public.notification_preferences np
      where np.institution_id=m.institution_id
        and np.membership_id=m.id
        and np.notification_type='message'
    ),true)
  on conflict (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
  do update set
    title=excluded.title,
    body=excluded.body,
    created_at=now(),
    read_at=null;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.is_staff_assigned_to_division(p_membership_id uuid, p_institution_id uuid, p_division_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.staff_assignments sa
    where sa.membership_id=p_membership_id
      and sa.institution_id=p_institution_id
      and (sa.starts_on is null or sa.starts_on<=current_date)
      and (sa.ends_on is null or sa.ends_on>=current_date)
      and (
        sa.division_id=p_division_id
        or sa.course_subject_id in (
          select cs.id
          from public.course_subjects cs
          join public.divisions d
            on d.course_id=cs.course_id and d.institution_id=cs.institution_id
          where d.id=p_division_id and d.institution_id=p_institution_id
        )
      )
  );
$function$;


CREATE OR REPLACE FUNCTION private.list_conversation_messages_impl(p_institution_id uuid, p_conversation_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, sender_membership_id uuid, sender_name text, body text, sent_at timestamp with time zone, read_at timestamp with time zone, is_mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_membership_id is null or not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=p_conversation_id
      and cm.institution_id=p_institution_id
      and cm.membership_id=v_membership_id
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


CREATE OR REPLACE FUNCTION private.list_messageable_contacts_impl(p_institution_id uuid)
 RETURNS TABLE(membership_id uuid, display_name text, role_keys text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sender_membership_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  select m.id into v_sender_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=p_institution_id
    and m.status='active'
  limit 1;
  if v_sender_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;

  return query
  select
    m.id,
    coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Usuario escolar'
    ),
    coalesce(array_agg(distinct r.key order by r.key) filter (where r.key is not null),array[]::text[])
  from public.memberships m
  left join public.profiles p on p.id=m.user_id
  left join public.membership_roles mr
    on mr.membership_id=m.id and mr.institution_id=m.institution_id
  left join public.roles r on r.id=mr.role_id
  where m.institution_id=p_institution_id
    and m.status='active'
    and m.id<>v_sender_membership_id
    and private.can_message_members(p_institution_id,v_sender_membership_id,m.id)
  group by m.id,p.display_name,p.first_name,p.last_name
  order by 2
  limit 250;
end;
$function$;


CREATE OR REPLACE FUNCTION private.list_my_conversations_impl(p_institution_id uuid)
 RETURNS TABLE(conversation_id uuid, subject text, counterpart_membership_id uuid, counterpart_name text, counterpart_role_keys text[], last_message_body text, last_message_at timestamp with time zone, unread_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where cm.conversation_id=c.id and cm.institution_id=c.institution_id
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
    where mr.membership_id=counterpart.id and mr.institution_id=counterpart.institution_id
  ) role_data on true
  left join lateral (
    select m.body,m.sent_at
    from public.messages m
    where m.conversation_id=c.id and m.institution_id=c.institution_id
    order by m.sent_at desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.conversation_id=c.id and m.institution_id=c.institution_id
      and m.sender_membership_id<>v_membership_id and m.read_at is null
  ) unread on true
  where c.institution_id=p_institution_id
    and mine.membership_id=v_membership_id
  order by coalesce(latest.sent_at,c.created_at) desc
  limit 100;
end;
$function$;


CREATE OR REPLACE FUNCTION private.mark_conversation_read_impl(p_institution_id uuid, p_conversation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_membership_id is null or not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=p_conversation_id
      and cm.institution_id=p_institution_id
      and cm.membership_id=v_membership_id
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


CREATE OR REPLACE FUNCTION private.send_conversation_message_impl(p_institution_id uuid, p_conversation_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_membership_id is null or not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=p_conversation_id
      and cm.institution_id=p_institution_id
      and cm.membership_id=v_membership_id
  ) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;
  if not exists (
    select 1
    from public.conversation_members cm
    join public.memberships recipient
      on recipient.id=cm.membership_id and recipient.institution_id=cm.institution_id
    where cm.conversation_id=p_conversation_id
      and cm.institution_id=p_institution_id
      and cm.membership_id<>v_membership_id
      and recipient.status='active'
  ) then
    raise exception 'The other conversation participant is not active' using errcode='42501';
  end if;

  insert into public.messages(institution_id,conversation_id,sender_membership_id,body)
  values(p_institution_id,p_conversation_id,v_membership_id,btrim(p_body))
  returning id into v_message_id;
  return v_message_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_institution_id uuid, p_recipient_membership_id uuid, p_subject text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_direct_conversation_impl(
    p_institution_id,p_recipient_membership_id,p_subject
  );
$function$;


CREATE OR REPLACE FUNCTION public.list_conversation_messages(p_institution_id uuid, p_conversation_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, sender_membership_id uuid, sender_name text, body text, sent_at timestamp with time zone, read_at timestamp with time zone, is_mine boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.list_conversation_messages_impl(
    p_institution_id,p_conversation_id,p_limit
  );
$function$;


CREATE OR REPLACE FUNCTION public.list_messageable_contacts(p_institution_id uuid)
 RETURNS TABLE(membership_id uuid, display_name text, role_keys text[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.list_messageable_contacts_impl(p_institution_id);
$function$;


CREATE OR REPLACE FUNCTION public.list_my_conversations(p_institution_id uuid)
 RETURNS TABLE(conversation_id uuid, subject text, counterpart_membership_id uuid, counterpart_name text, counterpart_role_keys text[], last_message_body text, last_message_at timestamp with time zone, unread_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.list_my_conversations_impl(p_institution_id);
$function$;


CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_institution_id uuid, p_conversation_id uuid)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.mark_conversation_read_impl(p_institution_id,p_conversation_id);
$function$;


CREATE OR REPLACE FUNCTION public.send_conversation_message(p_institution_id uuid, p_conversation_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.send_conversation_message_impl(
    p_institution_id,p_conversation_id,p_body
  );
$function$;


revoke all on function private.is_staff_assigned_to_division(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.can_message_members(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.fanout_message_notification() from public,anon,authenticated;
revoke all on function private.list_messageable_contacts_impl(uuid) from public,anon;
grant execute on function private.list_messageable_contacts_impl(uuid) to authenticated;
revoke all on function private.create_direct_conversation_impl(uuid,uuid,text) from public,anon;
grant execute on function private.create_direct_conversation_impl(uuid,uuid,text) to authenticated;
revoke all on function private.list_my_conversations_impl(uuid) from public,anon;
grant execute on function private.list_my_conversations_impl(uuid) to authenticated;
revoke all on function private.list_conversation_messages_impl(uuid,uuid,integer) from public,anon;
grant execute on function private.list_conversation_messages_impl(uuid,uuid,integer) to authenticated;
revoke all on function private.send_conversation_message_impl(uuid,uuid,text) from public,anon;
grant execute on function private.send_conversation_message_impl(uuid,uuid,text) to authenticated;
revoke all on function private.mark_conversation_read_impl(uuid,uuid) from public,anon;
grant execute on function private.mark_conversation_read_impl(uuid,uuid) to authenticated;
revoke all on function public.list_messageable_contacts(uuid) from public,anon;
grant execute on function public.list_messageable_contacts(uuid) to authenticated;
revoke all on function public.create_direct_conversation(uuid,uuid,text) from public,anon;
grant execute on function public.create_direct_conversation(uuid,uuid,text) to authenticated;
revoke all on function public.list_my_conversations(uuid) from public,anon;
grant execute on function public.list_my_conversations(uuid) to authenticated;
revoke all on function public.list_conversation_messages(uuid,uuid,integer) from public,anon;
grant execute on function public.list_conversation_messages(uuid,uuid,integer) to authenticated;
revoke all on function public.send_conversation_message(uuid,uuid,text) from public,anon;
grant execute on function public.send_conversation_message(uuid,uuid,text) to authenticated;
revoke all on function public.mark_conversation_read(uuid,uuid) from public,anon;
grant execute on function public.mark_conversation_read(uuid,uuid) to authenticated;

drop trigger if exists messages_fanout_notification on public.messages;
create trigger messages_fanout_notification
after insert on public.messages
for each row execute function private.fanout_message_notification();

revoke all on table public.conversations from public,anon,authenticated;
revoke all on table public.conversation_members from public,anon,authenticated;
revoke all on table public.messages from public,anon,authenticated;
