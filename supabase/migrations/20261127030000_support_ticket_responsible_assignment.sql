-- EDUNEXA: institutional support ticket assignment and append-only assignment history.
-- Repository migration only; it is intentionally not applied to hosted Supabase.

insert into public.permissions(key,description)
values ('support.respond_assigned','Consultar y responder tickets asignados a la membresía activa')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='support.respond_assigned'
where r.key in ('director','administrative','secretary','teacher','prefect')
on conflict do nothing;

create or replace function public.support_list_assignable_members(p_ticket_id uuid)
returns table(membership_id uuid,display_name text,role_label text)
language sql stable security definer set search_path=''
as $function$
  select m.id,
    coalesce(nullif(pg_catalog.btrim(p.display_name),''),
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',p.first_name,p.last_name)),''),
      'Integrante sin nombre'),
    pg_catalog.string_agg(distinct r.name,', ' order by r.name)
  from public.support_tickets t
  join public.memberships m on m.institution_id=t.institution_id and m.status='active'
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  left join public.profiles p on p.id=m.user_id
  where t.id=p_ticket_id
    and r.key in ('institution_admin','director','administrative','secretary','teacher','prefect')
    and exists (select 1 from public.memberships actor where actor.user_id=(select auth.uid())
      and actor.institution_id=t.institution_id and actor.status='active')
    and private.has_institution_permission(t.institution_id,'support.manage')
  group by m.id,p.display_name,p.first_name,p.last_name
  order by 2,3;
$function$;

create or replace function public.support_assign_ticket(
  p_ticket_id uuid,p_assignee_membership_id uuid,p_expected_assignee_membership_id uuid
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_actor_membership_id uuid;
  v_institution_id uuid;
  v_previous_assignee_membership_id uuid;
  v_event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;

  select t.institution_id,t.assigned_to_membership_id
    into v_institution_id,v_previous_assignee_membership_id
  from public.support_tickets t where t.id=p_ticket_id for update;
  if v_institution_id is null then
    raise exception using errcode='P0002',message='support_ticket_not_found';
  end if;

  select m.id into v_actor_membership_id from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=v_institution_id and m.status='active'
  limit 1;
  if v_actor_membership_id is null
    or not private.has_institution_permission(v_institution_id,'support.manage') then
    raise exception using errcode='42501',message='support_manage_permission_required';
  end if;

  if v_previous_assignee_membership_id is distinct from p_expected_assignee_membership_id then
    raise exception using errcode='40001',message='support_ticket_assignment_changed';
  end if;
  if p_assignee_membership_id is not null and not exists (
    select 1 from public.memberships target
    join public.membership_roles mr on mr.membership_id=target.id and mr.institution_id=target.institution_id
    join public.roles r on r.id=mr.role_id
    where target.id=p_assignee_membership_id and target.institution_id=v_institution_id
      and target.status='active'
      and r.key in ('institution_admin','director','administrative','secretary','teacher','prefect')
  ) then
    raise exception using errcode='22023',message='invalid_support_ticket_assignee';
  end if;
  if v_previous_assignee_membership_id is not distinct from p_assignee_membership_id then
    return null;
  end if;

  update public.support_tickets set assigned_to_membership_id=p_assignee_membership_id,
    updated_at=pg_catalog.now()
  where id=p_ticket_id and institution_id=v_institution_id;

  insert into public.support_ticket_events(institution_id,ticket_id,actor_membership_id,event_key,details)
  values (v_institution_id,p_ticket_id,v_actor_membership_id,'assignment_changed',
    pg_catalog.jsonb_build_object(
      'previous_assignee_membership_id',v_previous_assignee_membership_id,
      'new_assignee_membership_id',p_assignee_membership_id
    ))
  returning id into v_event_id;
  return v_event_id;
end;
$function$;

create or replace function public.support_list_ticket_assignment_history(p_ticket_id uuid)
returns table(actor_name text,previous_assignee_name text,new_assignee_name text,created_at timestamptz)
language sql stable security definer set search_path=''
as $function$
  select
    coalesce(nullif(pg_catalog.btrim(ap.display_name),''),
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',ap.first_name,ap.last_name)),''),
      'Integrante'),
    coalesce(nullif(pg_catalog.btrim(pp.display_name),''),
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',pp.first_name,pp.last_name)),''),
      case when pm.id is null then null else 'Integrante' end),
    coalesce(nullif(pg_catalog.btrim(np.display_name),''),
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',np.first_name,np.last_name)),''),
      case when nm.id is null then null else 'Integrante' end),
    e.created_at
  from public.support_ticket_events e
  join public.support_tickets t on t.id=e.ticket_id and t.institution_id=e.institution_id
  left join public.memberships am on am.id=e.actor_membership_id and am.institution_id=e.institution_id
  left join public.profiles ap on ap.id=am.user_id
  left join public.memberships pm on pm.id=nullif(e.details->>'previous_assignee_membership_id','')::uuid
    and pm.institution_id=e.institution_id
  left join public.profiles pp on pp.id=pm.user_id
  left join public.memberships nm on nm.id=nullif(e.details->>'new_assignee_membership_id','')::uuid
    and nm.institution_id=e.institution_id
  left join public.profiles np on np.id=nm.user_id
  where e.ticket_id=p_ticket_id and e.institution_id=t.institution_id and e.event_key='assignment_changed'
    and exists (select 1 from public.memberships viewer
      where viewer.user_id=(select auth.uid()) and viewer.institution_id=t.institution_id
        and viewer.status='active'
        and (private.has_institution_permission(t.institution_id,'support.manage')
          or (private.has_institution_permission(t.institution_id,'support.respond_assigned')
            and t.assigned_to_membership_id=viewer.id)))
  order by e.created_at desc;
$function$;

revoke all on function public.support_list_assignable_members(uuid) from public,anon;
revoke all on function public.support_assign_ticket(uuid,uuid,uuid) from public,anon;
revoke all on function public.support_list_ticket_assignment_history(uuid) from public,anon;
grant execute on function public.support_list_assignable_members(uuid) to authenticated;
grant execute on function public.support_assign_ticket(uuid,uuid,uuid) to authenticated;
grant execute on function public.support_list_ticket_assignment_history(uuid) to authenticated;

drop policy if exists support_tickets_select_own_or_admin on public.support_tickets;
create policy support_tickets_select_own_or_admin on public.support_tickets for select to authenticated
using (
  exists (select 1 from public.memberships m where m.id=support_tickets.created_by_membership_id
    and m.institution_id=support_tickets.institution_id and m.user_id=(select auth.uid()) and m.status='active')
  or private.has_institution_permission(institution_id,'support.read')
  or private.has_institution_permission(institution_id,'support.manage')
  or exists (select 1 from public.memberships am
    where am.id=support_tickets.assigned_to_membership_id and am.institution_id=support_tickets.institution_id
      and am.user_id=(select auth.uid()) and am.status='active'
      and private.has_institution_permission(institution_id,'support.respond_assigned'))
);

drop policy if exists support_ticket_messages_select_visible on public.support_ticket_messages;
create policy support_ticket_messages_select_visible on public.support_ticket_messages for select to authenticated
using (
  exists (select 1 from public.support_tickets t
    where t.id=support_ticket_messages.ticket_id and t.institution_id=support_ticket_messages.institution_id
      and (
        (support_ticket_messages.is_internal=false and exists (
          select 1 from public.memberships requester where requester.id=t.created_by_membership_id
            and requester.institution_id=t.institution_id and requester.user_id=(select auth.uid())
            and requester.status='active'))
        or private.has_institution_permission(t.institution_id,'support.manage')
        or (support_ticket_messages.is_internal=false and exists (
          select 1 from public.memberships am where am.id=t.assigned_to_membership_id
            and am.institution_id=t.institution_id and am.user_id=(select auth.uid()) and am.status='active'
            and private.has_institution_permission(t.institution_id,'support.respond_assigned')))
      ))
);

drop policy if exists support_ticket_messages_insert_visible on public.support_ticket_messages;
create policy support_ticket_messages_insert_visible on public.support_ticket_messages for insert to authenticated
with check (
  is_internal=false and author_kind='school_user'
  and exists (select 1 from public.memberships author
    join public.support_tickets t on t.id=support_ticket_messages.ticket_id
      and t.institution_id=support_ticket_messages.institution_id
    where author.id=support_ticket_messages.author_membership_id
      and author.institution_id=support_ticket_messages.institution_id
      and author.user_id=(select auth.uid()) and author.status='active'
      and t.status not in ('resolved','closed')
      and (t.created_by_membership_id=author.id
        or private.has_institution_permission(t.institution_id,'support.manage')
        or (t.assigned_to_membership_id=author.id
          and private.has_institution_permission(t.institution_id,'support.respond_assigned'))))
);

comment on function public.support_assign_ticket(uuid,uuid,uuid) is
'Atomically assigns or unassigns an institutional support ticket and appends an immutable assignment_changed event; validates actor permission, active same-institution assignee and expected previous assignee.';
