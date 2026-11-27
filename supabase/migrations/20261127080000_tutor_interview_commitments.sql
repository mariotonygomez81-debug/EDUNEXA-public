-- Family agreements and follow-up commitments attached to completed interviews.
create table if not exists public.teacher_guardian_appointment_commitments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  appointment_id uuid not null references public.teacher_guardian_appointments(id) on delete cascade,
  created_by_membership_id uuid not null references public.memberships(id) on delete restrict,
  updated_by_membership_id uuid not null references public.memberships(id) on delete restrict,
  title text not null,
  details text,
  responsible text not null check (responsible in ('teacher','guardian','student','family')),
  due_date date,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_guardian_appointment_commitments_title_length check (length(btrim(title)) between 3 and 160),
  constraint teacher_guardian_appointment_commitments_details_length check (details is null or length(details)<=1000)
);

create index if not exists teacher_guardian_appointment_commitments_appointment_idx
  on public.teacher_guardian_appointment_commitments(appointment_id,created_at,id);
alter table public.teacher_guardian_appointment_commitments enable row level security;
revoke all on public.teacher_guardian_appointment_commitments from public,anon,authenticated;

alter table public.teacher_guardian_appointment_events
  drop constraint if exists teacher_guardian_appointment_events_event_type_check;
alter table public.teacher_guardian_appointment_events
  add constraint teacher_guardian_appointment_events_event_type_check
  check (event_type in (
    'guardian_confirmed','guardian_declined','teacher_accepted_proposal',
    'interview_completed','appointment_cancelled','teacher_final_observation',
    'commitment_created','commitment_status_changed'
  ));

create or replace function private.list_my_teacher_guardian_appointment_commitments_impl()
returns table(
  commitment_id uuid,appointment_id uuid,title text,details text,responsible text,
  due_date date,status text,created_at timestamptz,updated_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_role text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id,m.institution_id,r.key into v_membership_id,v_institution_id,v_role
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key in ('teacher','guardian')
  order by case when r.key='guardian' then 0 else 1 end limit 1;
  if v_membership_id is null then raise exception 'Active teacher or guardian membership required' using errcode='42501'; end if;

  return query
  select c.id,c.appointment_id,c.title,c.details,c.responsible,c.due_date,c.status,c.created_at,c.updated_at
  from public.teacher_guardian_appointment_commitments c
  join public.teacher_guardian_appointments a on a.id=c.appointment_id and a.institution_id=c.institution_id
  where c.institution_id=v_institution_id
    and ((v_role='teacher' and a.teacher_membership_id=v_membership_id)
      or (v_role='guardian' and a.guardian_membership_id=v_membership_id))
  order by c.due_date nulls last,c.created_at desc;
end;
$function$;

create or replace function private.create_teacher_guardian_appointment_commitment_impl(
  p_appointment_id uuid,p_title text,p_details text,p_responsible text,p_due_date date
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_commitment_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160
    or length(coalesce(p_details,''))>1000
    or p_responsible not in ('teacher','guardian','student','family') then
    raise exception 'Invalid commitment data' using errcode='22023';
  end if;
  select m.id,m.institution_id into v_membership_id,v_institution_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
  limit 1;
  if v_membership_id is null then raise exception 'Active teacher membership required' using errcode='42501'; end if;
  if not exists(
    select 1 from public.teacher_guardian_appointments a
    where a.id=p_appointment_id and a.institution_id=v_institution_id
      and a.teacher_membership_id=v_membership_id and a.status='completed'
  ) then raise exception 'Commitments can only be added to the assigned teacher completed interviews' using errcode='42501'; end if;

  insert into public.teacher_guardian_appointment_commitments(
    institution_id,appointment_id,created_by_membership_id,updated_by_membership_id,
    title,details,responsible,due_date
  ) values(v_institution_id,p_appointment_id,v_membership_id,v_membership_id,
    btrim(p_title),nullif(btrim(p_details),''),p_responsible,p_due_date)
  returning id into v_commitment_id;
  return v_commitment_id;
end;
$function$;

create or replace function private.update_teacher_guardian_appointment_commitment_status_impl(
  p_commitment_id uuid,p_status text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid; v_role text; v_rows integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_status not in ('pending','in_progress','completed','cancelled') then
    raise exception 'Invalid commitment status' using errcode='22023';
  end if;
  select m.id,m.institution_id,r.key into v_membership_id,v_institution_id,v_role
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key in ('teacher','guardian')
  order by case when r.key='guardian' then 0 else 1 end limit 1;
  if v_membership_id is null then raise exception 'Active teacher or guardian membership required' using errcode='42501'; end if;

  update public.teacher_guardian_appointment_commitments c
  set status=p_status,updated_by_membership_id=v_membership_id,updated_at=now()
  from public.teacher_guardian_appointments a
  where c.id=p_commitment_id and a.id=c.appointment_id and a.institution_id=c.institution_id
    and c.institution_id=v_institution_id
    and ((v_role='teacher' and a.teacher_membership_id=v_membership_id)
      or (v_role='guardian' and a.guardian_membership_id=v_membership_id))
    and (p_status<>'completed' or
      (c.responsible in ('guardian','family','student') and v_role='guardian') or
      (c.responsible='teacher' and v_role='teacher'));
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception 'Commitment not found or only its responsible party can mark it completed' using errcode='42501'; end if;
  return true;
end;
$function$;

create or replace function private.record_teacher_guardian_appointment_commitment_event()
returns trigger
language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid; v_type text; v_body text;
begin
  v_actor := case when tg_op='INSERT' then new.created_by_membership_id else new.updated_by_membership_id end;
  v_type := case when tg_op='INSERT' then 'commitment_created' else 'commitment_status_changed' end;
  v_body := case when tg_op='INSERT'
    then 'Nuevo compromiso: '||new.title||'. Responsable: '||new.responsible||'. Estado: pendiente.'
    else 'Actualización del compromiso "'||new.title||'": estado '||new.status||'.' end;
  insert into public.teacher_guardian_appointment_events(
    institution_id,appointment_id,actor_membership_id,event_type,body
  ) values(new.institution_id,new.appointment_id,v_actor,v_type,left(v_body,1500));
  return new;
end;
$function$;

revoke all on function private.record_teacher_guardian_appointment_commitment_event() from public,anon,authenticated;
drop trigger if exists teacher_guardian_appointment_commitment_event on public.teacher_guardian_appointment_commitments;
create trigger teacher_guardian_appointment_commitment_event
after insert or update of status on public.teacher_guardian_appointment_commitments
for each row execute function private.record_teacher_guardian_appointment_commitment_event();

create or replace function private.notify_teacher_guardian_appointment_commitment()
returns trigger
language plpgsql security definer set search_path=''
as $function$
declare v_recipient uuid; v_title text; v_body text;
begin
  if new.event_type not in ('commitment_created','commitment_status_changed') then return new; end if;
  select case when new.actor_membership_id=a.teacher_membership_id then a.guardian_membership_id
    when new.actor_membership_id=a.guardian_membership_id then a.teacher_membership_id else null end
  into v_recipient
  from public.teacher_guardian_appointments a
  where a.id=new.appointment_id and a.institution_id=new.institution_id;
  if v_recipient is null then return new; end if;
  v_title := case when new.event_type='commitment_created' then 'Nuevo acuerdo de entrevista'
    else 'Se actualizó un compromiso familiar' end;
  v_body := left(coalesce(new.body,'Hay novedades en un compromiso de entrevista.'),500);
  insert into public.notifications(
    institution_id,recipient_membership_id,notification_type,title,body,resource_type,resource_id
  )
  select new.institution_id,v_recipient,'appointment',v_title,v_body,'appointment',new.id
  where coalesce((
    select np.in_app_enabled from public.notification_preferences np
    where np.institution_id=new.institution_id and np.membership_id=v_recipient
      and np.notification_type='appointment'
  ),true)
  on conflict (institution_id,recipient_membership_id,notification_type,resource_type,resource_id)
  do nothing;
  return new;
end;
$function$;

revoke all on function private.notify_teacher_guardian_appointment_commitment() from public,anon,authenticated;
drop trigger if exists teacher_guardian_appointment_commitment_notify on public.teacher_guardian_appointment_events;
create trigger teacher_guardian_appointment_commitment_notify
after insert on public.teacher_guardian_appointment_events
for each row execute function private.notify_teacher_guardian_appointment_commitment();

create or replace function public.list_my_teacher_guardian_appointment_commitments()
returns table(
  commitment_id uuid,appointment_id uuid,title text,details text,responsible text,
  due_date date,status text,created_at timestamptz,updated_at timestamptz
) language sql stable security invoker set search_path=''
as $function$ select * from private.list_my_teacher_guardian_appointment_commitments_impl(); $function$;

create or replace function public.create_teacher_guardian_appointment_commitment(
  p_appointment_id uuid,p_title text,p_details text default null,
  p_responsible text default 'guardian',p_due_date date default null
) returns uuid language sql security invoker set search_path=''
as $function$ select private.create_teacher_guardian_appointment_commitment_impl(
  p_appointment_id,p_title,p_details,p_responsible,p_due_date
); $function$;

create or replace function public.update_teacher_guardian_appointment_commitment_status(
  p_commitment_id uuid,p_status text
) returns boolean language sql security invoker set search_path=''
as $function$ select private.update_teacher_guardian_appointment_commitment_status_impl(p_commitment_id,p_status); $function$;

revoke all on function private.list_my_teacher_guardian_appointment_commitments_impl() from public,anon;
revoke all on function private.create_teacher_guardian_appointment_commitment_impl(uuid,text,text,text,date) from public,anon;
revoke all on function private.update_teacher_guardian_appointment_commitment_status_impl(uuid,text) from public,anon;
grant execute on function private.list_my_teacher_guardian_appointment_commitments_impl() to authenticated;
grant execute on function private.create_teacher_guardian_appointment_commitment_impl(uuid,text,text,text,date) to authenticated;
grant execute on function private.update_teacher_guardian_appointment_commitment_status_impl(uuid,text) to authenticated;

revoke all on function public.list_my_teacher_guardian_appointment_commitments() from public,anon;
revoke all on function public.create_teacher_guardian_appointment_commitment(uuid,text,text,text,date) from public,anon;
revoke all on function public.update_teacher_guardian_appointment_commitment_status(uuid,text) from public,anon;
grant execute on function public.list_my_teacher_guardian_appointment_commitments() to authenticated;
grant execute on function public.create_teacher_guardian_appointment_commitment(uuid,text,text,text,date) to authenticated;
grant execute on function public.update_teacher_guardian_appointment_commitment_status(uuid,text) to authenticated;
