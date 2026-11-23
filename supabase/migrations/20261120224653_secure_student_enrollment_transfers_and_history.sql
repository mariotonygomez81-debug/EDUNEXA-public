alter table public.enrollments
  add constraint enrollments_end_date_valid
  check (ended_on is null or ended_on>=enrolled_on);
alter table public.enrollments
  add constraint enrollments_status_end_consistency
  check ((status='active' and ended_on is null) or (status<>'active' and ended_on is not null));

create unique index enrollments_one_active_per_student
  on public.enrollments(institution_id,student_id)
  where status='active' and ended_on is null;

create table public.enrollment_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null,
  enrollment_id uuid not null,
  actor_membership_id uuid not null,
  event_type text not null check (event_type in ('enrolled','transferred','withdrawn','completed')),
  effective_on date not null,
  from_division_id uuid,
  to_division_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  constraint enrollment_events_reason_length check (reason is null or length(reason)<=500),
  constraint enrollment_events_student_fk foreign key(student_id,institution_id)
    references public.students(id,institution_id),
  constraint enrollment_events_enrollment_fk foreign key(enrollment_id,institution_id)
    references public.enrollments(id,institution_id),
  constraint enrollment_events_actor_fk foreign key(actor_membership_id,institution_id)
    references public.memberships(id,institution_id),
  constraint enrollment_events_from_division_fk foreign key(from_division_id,institution_id)
    references public.divisions(id,institution_id),
  constraint enrollment_events_to_division_fk foreign key(to_division_id,institution_id)
    references public.divisions(id,institution_id)
);
alter table public.enrollment_events enable row level security;
revoke all on table public.enrollment_events from public,anon,authenticated;
create index enrollment_events_student_history_idx
  on public.enrollment_events(institution_id,student_id,effective_on desc,created_at desc);

CREATE OR REPLACE FUNCTION private.close_student_enrollment_impl(p_institution_id uuid, p_enrollment_id uuid, p_final_status text, p_effective_on date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_membership_id uuid;
  v_enrollment public.enrollments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active'
  limit 1;
  if v_membership_id is null or not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if p_final_status not in ('withdrawn','completed') or p_effective_on is null
    or (p_reason is not null and length(p_reason)>500) then
    raise exception 'Invalid enrollment closure data' using errcode='22023';
  end if;

  select e.* into v_enrollment
  from public.enrollments e
  where e.id=p_enrollment_id and e.institution_id=p_institution_id
  for update;
  if not found then raise exception 'Enrollment not found' using errcode='P0002'; end if;
  if v_enrollment.status<>'active' or v_enrollment.ended_on is not null then
    raise exception 'Only an active enrollment can be closed' using errcode='23514';
  end if;
  if p_effective_on<v_enrollment.enrolled_on then
    raise exception 'End date cannot precede enrollment start' using errcode='22023';
  end if;

  update public.enrollments
  set status=p_final_status,ended_on=p_effective_on
  where id=p_enrollment_id and institution_id=p_institution_id;

  insert into public.enrollment_events(
    institution_id,student_id,enrollment_id,actor_membership_id,event_type,effective_on,
    from_division_id,reason
  ) values (
    p_institution_id,v_enrollment.student_id,p_enrollment_id,v_membership_id,p_final_status,p_effective_on,
    v_enrollment.division_id,nullif(btrim(p_reason),'')
  );
  return p_enrollment_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.create_student_enrollment_impl(p_institution_id uuid, p_student_id uuid, p_division_id uuid, p_enrolled_on date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_membership_id uuid;
  v_student_status text;
  v_enrolled_on date:=coalesce(p_enrolled_on,current_date);
  v_enrollment_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active'
  limit 1;
  if v_membership_id is null or not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if p_student_id is null or p_division_id is null or (p_reason is not null and length(p_reason)>500) then
    raise exception 'Invalid enrollment data' using errcode='22023';
  end if;

  select s.status into v_student_status
  from public.students s
  where s.id=p_student_id and s.institution_id=p_institution_id
  for update;
  if not found then raise exception 'Student not found' using errcode='P0002'; end if;
  if v_student_status<>'active' then
    raise exception 'Only active student records can be enrolled' using errcode='23514';
  end if;
  if not exists (
    select 1 from public.divisions d
    join public.academic_years ay on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
    where d.id=p_division_id and d.institution_id=p_institution_id and ay.status<>'closed'
  ) then raise exception 'Division is not available for enrollment' using errcode='23503'; end if;
  if exists (
    select 1 from public.enrollments e
    where e.institution_id=p_institution_id and e.student_id=p_student_id
      and e.status='active' and e.ended_on is null
  ) then raise exception 'Student already has an active enrollment; use transfer or close it first' using errcode='23505'; end if;

  insert into public.enrollments(institution_id,student_id,division_id,enrolled_on,status,ended_on)
  values(p_institution_id,p_student_id,p_division_id,v_enrolled_on,'active',null)
  returning id into v_enrollment_id;

  insert into public.enrollment_events(
    institution_id,student_id,enrollment_id,actor_membership_id,event_type,effective_on,to_division_id,reason
  ) values (
    p_institution_id,p_student_id,v_enrollment_id,v_membership_id,'enrolled',v_enrolled_on,p_division_id,nullif(btrim(p_reason),'')
  );
  return v_enrollment_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.list_student_enrollment_events_impl(p_institution_id uuid, p_student_id uuid)
 RETURNS TABLE(id uuid, event_type text, effective_on date, from_division_name text, to_division_name text, reason text, actor_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if not exists(select 1 from public.students s where s.id=p_student_id and s.institution_id=p_institution_id) then
    raise exception 'Student not found' using errcode='P0002';
  end if;
  return query
  select
    ev.id,ev.event_type,ev.effective_on,fd.name,td.name,ev.reason,
    coalesce(nullif(btrim(p.display_name),''),nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Personal'),
    ev.created_at
  from public.enrollment_events ev
  left join public.divisions fd on fd.id=ev.from_division_id and fd.institution_id=ev.institution_id
  left join public.divisions td on td.id=ev.to_division_id and td.institution_id=ev.institution_id
  join public.memberships m on m.id=ev.actor_membership_id and m.institution_id=ev.institution_id
  left join public.profiles p on p.id=m.user_id
  where ev.institution_id=p_institution_id and ev.student_id=p_student_id
  order by ev.effective_on desc,ev.created_at desc
  limit 100;
end;
$function$


CREATE OR REPLACE FUNCTION private.transfer_student_enrollment_impl(p_institution_id uuid, p_student_id uuid, p_new_division_id uuid, p_effective_on date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_membership_id uuid;
  v_student_status text;
  v_old public.enrollments%rowtype;
  v_new_enrollment_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id into v_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid()) and m.institution_id=p_institution_id and m.status='active'
  limit 1;
  if v_membership_id is null or not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if p_student_id is null or p_new_division_id is null or p_effective_on is null
    or (p_reason is not null and length(p_reason)>500) then
    raise exception 'Invalid transfer data' using errcode='22023';
  end if;

  select s.status into v_student_status
  from public.students s
  where s.id=p_student_id and s.institution_id=p_institution_id
  for update;
  if not found or v_student_status<>'active' then
    raise exception 'Active student record required' using errcode='P0002';
  end if;

  select e.* into v_old
  from public.enrollments e
  where e.institution_id=p_institution_id and e.student_id=p_student_id
    and e.status='active' and e.ended_on is null
  order by e.enrolled_on desc
  limit 1
  for update;
  if not found then raise exception 'Student has no active enrollment to transfer' using errcode='P0002'; end if;
  if p_effective_on<=v_old.enrolled_on then
    raise exception 'Transfer date must be after the current enrollment start' using errcode='22023';
  end if;
  if p_new_division_id=v_old.division_id then
    raise exception 'New division must differ from current division' using errcode='23514';
  end if;
  if not exists (
    select 1 from public.divisions d
    join public.academic_years ay on ay.id=d.academic_year_id and ay.institution_id=d.institution_id
    where d.id=p_new_division_id and d.institution_id=p_institution_id and ay.status<>'closed'
  ) then raise exception 'New division is not available for enrollment' using errcode='23503'; end if;

  update public.enrollments
  set status='transferred',ended_on=p_effective_on-1
  where id=v_old.id and institution_id=p_institution_id;

  insert into public.enrollments(institution_id,student_id,division_id,enrolled_on,status,ended_on)
  values(p_institution_id,p_student_id,p_new_division_id,p_effective_on,'active',null)
  returning id into v_new_enrollment_id;

  insert into public.enrollment_events(
    institution_id,student_id,enrollment_id,actor_membership_id,event_type,effective_on,
    from_division_id,to_division_id,reason
  ) values (
    p_institution_id,p_student_id,v_new_enrollment_id,v_membership_id,'transferred',p_effective_on,
    v_old.division_id,p_new_division_id,nullif(btrim(p_reason),'')
  );
  return v_new_enrollment_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.close_student_enrollment(p_institution_id uuid, p_enrollment_id uuid, p_final_status text, p_effective_on date, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.close_student_enrollment_impl(p_institution_id,p_enrollment_id,p_final_status,p_effective_on,p_reason);
$function$


CREATE OR REPLACE FUNCTION public.create_student_enrollment(p_institution_id uuid, p_student_id uuid, p_division_id uuid, p_enrolled_on date DEFAULT NULL::date, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_student_enrollment_impl(p_institution_id,p_student_id,p_division_id,p_enrolled_on,p_reason);
$function$


CREATE OR REPLACE FUNCTION public.list_student_enrollment_events(p_institution_id uuid, p_student_id uuid)
 RETURNS TABLE(id uuid, event_type text, effective_on date, from_division_name text, to_division_name text, reason text, actor_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.list_student_enrollment_events_impl(p_institution_id,p_student_id);
$function$


CREATE OR REPLACE FUNCTION public.transfer_student_enrollment(p_institution_id uuid, p_student_id uuid, p_new_division_id uuid, p_effective_on date, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.transfer_student_enrollment_impl(p_institution_id,p_student_id,p_new_division_id,p_effective_on,p_reason);
$function$


revoke all on function private.create_student_enrollment_impl(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function private.create_student_enrollment_impl(uuid,uuid,uuid,date,text) to authenticated;
revoke all on function public.create_student_enrollment(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.create_student_enrollment(uuid,uuid,uuid,date,text) to authenticated;
revoke all on function private.transfer_student_enrollment_impl(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function private.transfer_student_enrollment_impl(uuid,uuid,uuid,date,text) to authenticated;
revoke all on function public.transfer_student_enrollment(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.transfer_student_enrollment(uuid,uuid,uuid,date,text) to authenticated;
revoke all on function private.close_student_enrollment_impl(uuid,uuid,text,date,text) from public,anon;
grant execute on function private.close_student_enrollment_impl(uuid,uuid,text,date,text) to authenticated;
revoke all on function public.close_student_enrollment(uuid,uuid,text,date,text) from public,anon;
grant execute on function public.close_student_enrollment(uuid,uuid,text,date,text) to authenticated;
revoke all on function private.list_student_enrollment_events_impl(uuid,uuid) from public,anon;
grant execute on function private.list_student_enrollment_events_impl(uuid,uuid) to authenticated;
revoke all on function public.list_student_enrollment_events(uuid,uuid) from public,anon;
grant execute on function public.list_student_enrollment_events(uuid,uuid) to authenticated;

revoke insert,update,delete on table public.enrollments from public,anon,authenticated;
grant select on table public.enrollments to authenticated;
