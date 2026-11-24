create or replace function private.create_direct_conversation_impl(
  p_institution_id uuid,
  p_recipient_membership_id uuid,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sender_membership_id uuid;
  v_conversation_id uuid;
  v_is_student boolean;
  v_previous_subject_contact boolean := false;
  v_subject text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_institution_id is null or p_recipient_membership_id is null
    or (p_subject is not null and length(btrim(p_subject))>120) then
    raise exception 'Invalid conversation data' using errcode='22023';
  end if;

  select m.id into v_sender_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active'
  limit 1;
  if v_sender_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;

  if not private.can_message_members(p_institution_id,v_sender_membership_id,p_recipient_membership_id) then
    raise exception 'Recipient is outside your authorized messaging scope' using errcode='42501';
  end if;

  select exists (
    select 1 from public.membership_roles mr
    join public.roles r on r.id=mr.role_id
    where mr.membership_id=v_sender_membership_id and mr.institution_id=p_institution_id
      and r.key='student'
  ) into v_is_student;

  v_previous_subject_contact := v_is_student and private.is_staff_assigned_to_previous_subject(
    v_sender_membership_id,p_recipient_membership_id,p_institution_id
  );

  v_subject := nullif(btrim(p_subject),'');
  if v_previous_subject_contact and coalesce(v_subject,'') not like 'Materia previa:%' then
    v_subject := 'Materia previa: ' || coalesce(v_subject,'Consulta académica');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_institution_id::text||':'||
      least(v_sender_membership_id::text,p_recipient_membership_id::text)||':'||
      greatest(v_sender_membership_id::text,p_recipient_membership_id::text),0
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
    and (select count(*) from public.conversation_members cm
      where cm.conversation_id=c.id and cm.institution_id=c.institution_id)=2
  order by c.created_at desc
  limit 1;

  if v_conversation_id is not null then
    if v_previous_subject_contact then
      update public.conversations
      set subject=case when coalesce(subject,'') like 'Materia previa:%'
        then subject else 'Materia previa: ' || coalesce(nullif(btrim(subject),''),'Consulta académica') end
      where id=v_conversation_id and institution_id=p_institution_id;
    end if;
    return v_conversation_id;
  end if;

  insert into public.conversations(institution_id,subject,created_by)
  values (p_institution_id,v_subject,(select auth.uid()))
  returning id into v_conversation_id;

  insert into public.conversation_members(conversation_id,institution_id,membership_id)
  values
    (v_conversation_id,p_institution_id,v_sender_membership_id),
    (v_conversation_id,p_institution_id,p_recipient_membership_id);

  return v_conversation_id;
end;
$function$;

revoke all on function private.create_direct_conversation_impl(uuid,uuid,text) from public,anon;
grant execute on function private.create_direct_conversation_impl(uuid,uuid,text) to authenticated;
