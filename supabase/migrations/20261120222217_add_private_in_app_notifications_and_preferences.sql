create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  recipient_membership_id uuid not null,
  notification_type text not null check (notification_type in ('announcement','message','grade','attendance','support')),
  title text not null check (length(btrim(title)) between 1 and 180),
  body text not null default '' check (length(body)<=500),
  resource_type text not null check (resource_type in ('announcement','conversation','grade','attendance','support_ticket')),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_recipient_membership_fk
    foreign key (recipient_membership_id,institution_id)
    references public.memberships(id,institution_id) on delete cascade,
  constraint notifications_resource_unique
    unique (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
);

create table if not exists public.notification_preferences (
  institution_id uuid not null,
  membership_id uuid not null,
  notification_type text not null check (notification_type in ('announcement','message','grade','attendance','support')),
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (institution_id,membership_id,notification_type),
  constraint notification_preferences_membership_fk
    foreign key (membership_id,institution_id)
    references public.memberships(id,institution_id) on delete cascade
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read
on public.notifications for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.id=notifications.recipient_membership_id
      and m.institution_id=notifications.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

drop policy if exists notification_preferences_owner_read on public.notification_preferences;
create policy notification_preferences_owner_read
on public.notification_preferences for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.id=notification_preferences.membership_id
      and m.institution_id=notification_preferences.institution_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

revoke all on table public.notifications from public,anon,authenticated;
grant select on table public.notifications to authenticated;
revoke all on table public.notification_preferences from public,anon,authenticated;
grant select on table public.notification_preferences to authenticated;

create index if not exists notifications_recipient_inbox_idx
  on public.notifications(institution_id,recipient_membership_id,created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications(institution_id,recipient_membership_id,created_at desc)
  where read_at is null;

create or replace function private.fanout_announcement_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  )
  select distinct
    m.institution_id,
    m.id,
    'announcement',
    'Nuevo anuncio: '||new.title,
    left(new.body,500),
    'announcement',
    new.id
  from public.memberships m
  where m.institution_id=new.institution_id
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
        and np.notification_type='announcement'
    ),true)
    and (
      new.audience='institution'
      or (
        new.audience='staff'
        and exists (
          select 1 from public.membership_roles mr
          join public.roles r on r.id=mr.role_id
          where mr.membership_id=m.id and mr.institution_id=m.institution_id
            and r.key in ('institution_admin','director','administrative','teacher','prefect')
        )
      )
      or (
        new.audience='families'
        and (
          exists (
            select 1 from public.membership_roles mr
            join public.roles r on r.id=mr.role_id
            where mr.membership_id=m.id and mr.institution_id=m.institution_id
              and r.key in ('institution_admin','director','administrative')
          )
          or exists (
            select 1 from public.membership_roles mr
            join public.roles r on r.id=mr.role_id
            join public.guardians g on g.membership_id=m.id and g.institution_id=m.institution_id
            where mr.membership_id=m.id and mr.institution_id=m.institution_id
              and r.key='guardian' and g.receives_notifications=true
          )
        )
      )
      or (
        new.audience='students'
        and exists (
          select 1 from public.membership_roles mr
          join public.roles r on r.id=mr.role_id
          where mr.membership_id=m.id and mr.institution_id=m.institution_id
            and r.key in ('institution_admin','director','administrative','teacher','prefect','student')
        )
      )
      or (
        new.audience='course'
        and (
          exists (
            select 1 from public.membership_roles mr
            join public.roles r on r.id=mr.role_id
            where mr.membership_id=m.id and mr.institution_id=m.institution_id
              and r.key in ('institution_admin','director','administrative')
          )
          or exists (
            select 1
            from public.membership_roles mr
            join public.roles r on r.id=mr.role_id
            join public.staff_assignments sa
              on sa.membership_id=m.id and sa.institution_id=m.institution_id
            where mr.membership_id=m.id and mr.institution_id=m.institution_id
              and r.key in ('teacher','prefect')
              and (sa.starts_on is null or sa.starts_on<=current_date)
              and (sa.ends_on is null or sa.ends_on>=current_date)
              and (
                sa.division_id=new.division_id
                or sa.course_subject_id in (
                  select cs.id
                  from public.course_subjects cs
                  join public.divisions d
                    on d.course_id=cs.course_id and d.institution_id=cs.institution_id
                  where d.id=new.division_id and d.institution_id=new.institution_id
                )
              )
          )
          or exists (
            select 1
            from public.membership_roles mr
            join public.roles r on r.id=mr.role_id
            join public.student_memberships sm
              on sm.membership_id=m.id and sm.institution_id=m.institution_id
            join public.enrollments e
              on e.student_id=sm.student_id and e.institution_id=sm.institution_id
            where mr.membership_id=m.id and mr.institution_id=m.institution_id
              and r.key='student'
              and e.division_id=new.division_id and e.status='active'
              and e.enrolled_on<=current_date
              and (e.ended_on is null or e.ended_on>=current_date)
          )
          or exists (
            select 1
            from public.membership_roles mr
            join public.roles r on r.id=mr.role_id
            join public.guardians g
              on g.membership_id=m.id and g.institution_id=m.institution_id
            join public.student_guardians sg
              on sg.guardian_id=g.id and sg.institution_id=g.institution_id
            join public.enrollments e
              on e.student_id=sg.student_id and e.institution_id=sg.institution_id
            where mr.membership_id=m.id and mr.institution_id=m.institution_id
              and r.key='guardian' and g.receives_notifications=true
              and e.division_id=new.division_id and e.status='active'
              and e.enrolled_on<=current_date
              and (e.ended_on is null or e.ended_on>=current_date)
          )
        )
      )
    )
  on conflict (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
  do nothing;

  return new;
end;
$function$;

revoke all on function private.fanout_announcement_notification() from public,anon,authenticated;

drop trigger if exists announcements_fanout_notification on public.announcements;
create trigger announcements_fanout_notification
after insert on public.announcements
for each row execute function private.fanout_announcement_notification();

create or replace function private.mark_notification_read_impl(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_institution_id uuid;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  where m.user_id=(select auth.uid()) and m.status='active'
  limit 1;
  if v_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;
  update public.notifications
  set read_at=coalesce(read_at,now())
  where id=p_notification_id
    and recipient_membership_id=v_membership_id
    and institution_id=v_institution_id;
  get diagnostics v_count=row_count;
  return v_count=1;
end;
$function$;

revoke all on function private.mark_notification_read_impl(uuid) from public,anon;
grant execute on function private.mark_notification_read_impl(uuid) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language sql
security invoker
set search_path=''
as $function$
  select private.mark_notification_read_impl(p_notification_id);
$function$;

revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function private.set_notification_preference_impl(
  p_notification_type text,
  p_in_app_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_institution_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if p_notification_type is null
    or p_notification_type not in ('announcement','message','grade','attendance','support')
    or p_in_app_enabled is null then
    raise exception 'Invalid notification preference' using errcode='22023';
  end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  where m.user_id=(select auth.uid()) and m.status='active'
  limit 1;
  if v_membership_id is null then
    raise exception 'Active membership required' using errcode='42501';
  end if;
  insert into public.notification_preferences(
    institution_id,membership_id,notification_type,in_app_enabled
  ) values (
    v_institution_id,v_membership_id,p_notification_type,p_in_app_enabled
  )
  on conflict (institution_id,membership_id,notification_type)
  do update set in_app_enabled=excluded.in_app_enabled,updated_at=now();
  return true;
end;
$function$;

revoke all on function private.set_notification_preference_impl(text,boolean) from public,anon;
grant execute on function private.set_notification_preference_impl(text,boolean) to authenticated;

create or replace function public.set_notification_preference(
  p_notification_type text,
  p_in_app_enabled boolean
)
returns boolean
language sql
security invoker
set search_path=''
as $function$
  select private.set_notification_preference_impl(p_notification_type,p_in_app_enabled);
$function$;

revoke all on function public.set_notification_preference(text,boolean) from public,anon;
grant execute on function public.set_notification_preference(text,boolean) to authenticated;
