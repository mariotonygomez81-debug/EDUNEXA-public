-- Student-scoped direct conversations; existing generic conversations and messages remain untouched.
alter table public.conversations
  add column if not exists student_id uuid
  references public.students(id) on delete restrict;

create index if not exists conversations_student_scope_idx
  on public.conversations(institution_id,student_id,created_at desc)
  where student_id is not null;

create or replace function private.can_message_about_student(
  p_institution_id uuid,p_sender_membership_id uuid,
  p_recipient_membership_id uuid,p_student_id uuid
)
returns boolean language plpgsql stable security definer set search_path=''
as $function$
declare
  v_sender_guardian boolean;
  v_recipient_guardian boolean;
  v_sender_staff boolean;
  v_recipient_staff boolean;
  v_division_id uuid;
begin
  if p_institution_id is null or p_sender_membership_id is null
    or p_recipient_membership_id is null or p_student_id is null
    or p_sender_membership_id=p_recipient_membership_id then return false; end if;

  if not private.can_message_members(p_institution_id,p_sender_membership_id,p_recipient_membership_id) then
    return false;
  end if;

  if (select count(*) from public.memberships m
      where m.id in (p_sender_membership_id,p_recipient_membership_id)
        and m.institution_id=p_institution_id and m.status='active')<>2 then
    return false;
  end if;

  select e.division_id into v_division_id
  from public.enrollments e
  where e.student_id=p_student_id and e.institution_id=p_institution_id
    and e.status='active' and e.enrolled_on<=current_date
    and (e.ended_on is null or e.ended_on>=current_date)
  order by e.enrolled_on desc limit 1;
  if v_division_id is null then return false; end if;

  select
    exists(select 1 from public.membership_roles mr join public.roles r on r.id=mr.role_id where mr.membership_id=p_sender_membership_id and mr.institution_id=p_institution_id and r.key='guardian'),
    exists(select 1 from public.membership_roles mr join public.roles r on r.id=mr.role_id where mr.membership_id=p_recipient_membership_id and mr.institution_id=p_institution_id and r.key='guardian'),
    exists(select 1 from public.membership_roles mr join public.roles r on r.id=mr.role_id where mr.membership_id=p_sender_membership_id and mr.institution_id=p_institution_id and r.key in ('teacher','prefect')),
    exists(select 1 from public.membership_roles mr join public.roles r on r.id=mr.role_id where mr.membership_id=p_recipient_membership_id and mr.institution_id=p_institution_id and r.key in ('teacher','prefect'))
  into v_sender_guardian,v_recipient_guardian,v_sender_staff,v_recipient_staff;

  if v_sender_guardian and v_recipient_staff then
    return exists(select 1 from public.guardians g
      join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
      where g.membership_id=p_sender_membership_id and g.institution_id=p_institution_id and sg.student_id=p_student_id)
      and private.is_staff_assigned_to_division(p_recipient_membership_id,p_institution_id,v_division_id);
  elsif v_sender_staff and v_recipient_guardian then
    return exists(select 1 from public.guardians g
      join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
      where g.membership_id=p_recipient_membership_id and g.institution_id=p_institution_id and sg.student_id=p_student_id)
      and private.is_staff_assigned_to_division(p_sender_membership_id,p_institution_id,v_division_id);
  end if;
  return false;
end;
$function$;

create or replace function private.create_student_direct_conversation_impl(
  p_institution_id uuid,p_recipient_membership_id uuid,p_student_id uuid,p_subject text default null
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_sender_membership_id uuid; v_conversation_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_institution_id is null or p_recipient_membership_id is null or p_student_id is null
    or (p_subject is not null and length(btrim(p_subject))>120) then
    raise exception 'Invalid student conversation data' using errcode='22023';
  end if;
  select m.id into v_sender_membership_id from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active' limit 1;
  if v_sender_membership_id is null or not private.can_message_about_student(
    p_institution_id,v_sender_membership_id,p_recipient_membership_id,p_student_id
  ) then raise exception 'Student or recipient is outside your authorized scope' using errcode='42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_institution_id::text||':'||p_student_id::text||':'||
    least(v_sender_membership_id::text,p_recipient_membership_id::text)||':'||
    greatest(v_sender_membership_id::text,p_recipient_membership_id::text),0));

  select c.id into v_conversation_id from public.conversations c
  where c.institution_id=p_institution_id and c.student_id=p_student_id
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.institution_id=c.institution_id and cm.membership_id=v_sender_membership_id)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.institution_id=c.institution_id and cm.membership_id=p_recipient_membership_id)
    and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id and cm.institution_id=c.institution_id)=2
  order by c.created_at desc limit 1;
  if v_conversation_id is not null then return v_conversation_id; end if;

  insert into public.conversations(institution_id,subject,created_by,student_id)
  values(p_institution_id,nullif(btrim(p_subject),''),(select auth.uid()),p_student_id)
  returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id,institution_id,membership_id)
  values(v_conversation_id,p_institution_id,v_sender_membership_id),
        (v_conversation_id,p_institution_id,p_recipient_membership_id);
  return v_conversation_id;
end;
$function$;

create or replace function private.list_my_student_conversations_impl(p_institution_id uuid,p_student_id uuid)
returns table(conversation_id uuid,student_id uuid,student_name text)
language plpgsql stable security definer set search_path=''
as $function$
declare v_membership_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id into v_membership_id from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active' limit 1;
  if v_membership_id is null or not exists(
    select 1 from public.guardians g
    join public.student_guardians sg on sg.guardian_id=g.id and sg.institution_id=g.institution_id
    where g.membership_id=v_membership_id and g.institution_id=p_institution_id and sg.student_id=p_student_id
  ) then raise exception 'Student is not linked to this guardian' using errcode='42501'; end if;

  return query
  select c.id,c.student_id,concat_ws(' ',st.last_name,st.first_name)
  from public.conversations c
  join public.students st on st.id=c.student_id and st.institution_id=c.institution_id
  join public.conversation_members mine on mine.conversation_id=c.id and mine.institution_id=c.institution_id and mine.membership_id=v_membership_id
  join public.conversation_members other_member on other_member.conversation_id=c.id and other_member.institution_id=c.institution_id and other_member.membership_id<>v_membership_id
  where c.institution_id=p_institution_id and c.student_id=p_student_id
    and private.can_message_about_student(p_institution_id,v_membership_id,other_member.membership_id,p_student_id)
  order by c.created_at desc;
end;
$function$;

create or replace function public.create_student_direct_conversation(
  p_institution_id uuid,p_recipient_membership_id uuid,p_student_id uuid,p_subject text default null
)
returns uuid language sql set search_path=''
as $function$ select private.create_student_direct_conversation_impl(p_institution_id,p_recipient_membership_id,p_student_id,p_subject); $function$;

create or replace function public.list_my_student_conversations(p_institution_id uuid,p_student_id uuid)
returns table(conversation_id uuid,student_id uuid,student_name text)
language sql stable set search_path=''
as $function$ select * from private.list_my_student_conversations_impl(p_institution_id,p_student_id); $function$;

revoke all on function private.can_message_about_student(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_message_about_student(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function private.create_student_direct_conversation_impl(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.create_student_direct_conversation_impl(uuid,uuid,uuid,text) to authenticated;
revoke all on function private.list_my_student_conversations_impl(uuid,uuid) from public,anon;
grant execute on function private.list_my_student_conversations_impl(uuid,uuid) to authenticated;
revoke all on function public.create_student_direct_conversation(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.create_student_direct_conversation(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.list_my_student_conversations(uuid,uuid) from public,anon;
grant execute on function public.list_my_student_conversations(uuid,uuid) to authenticated;
