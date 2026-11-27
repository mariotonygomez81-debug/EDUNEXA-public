create or replace function private.assert_division_available_for_enrollment(
  p_institution_id uuid,
  p_division_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_capacity integer;
  v_starts_on date;
  v_ends_on date;
  v_year_status text;
  v_active_count bigint;
begin
  select d.capacity,ay.starts_on,ay.ends_on,ay.status
  into v_capacity,v_starts_on,v_ends_on,v_year_status
  from public.divisions d
  join public.academic_years ay
    on ay.id=d.academic_year_id
    and ay.institution_id=d.institution_id
  where d.id=p_division_id
    and d.institution_id=p_institution_id
  for update of d;

  if not found then
    raise exception 'Division is not available in this institution' using errcode='23503';
  end if;
  if v_year_status='closed' then
    raise exception 'Academic year is closed' using errcode='23514';
  end if;
  if (v_starts_on is not null and p_effective_on<v_starts_on)
    or (v_ends_on is not null and p_effective_on>v_ends_on) then
    raise exception 'Enrollment date is outside the academic year' using errcode='22023';
  end if;

  if v_capacity is not null then
    select count(*) into v_active_count
    from public.enrollments e
    where e.institution_id=p_institution_id
      and e.division_id=p_division_id
      and e.status='active'
      and e.ended_on is null;
    if v_active_count>=v_capacity then
      raise exception 'Division capacity has been reached' using errcode='23514';
    end if;
  end if;
end;
$function$;

create or replace function private.create_student_enrollment_impl(
  p_institution_id uuid,
  p_student_id uuid,
  p_division_id uuid,
  p_enrolled_on date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_student_status text;
  v_enrolled_on date:=coalesce(p_enrolled_on,current_date);
  v_enrollment_id uuid;
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
    or not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if p_student_id is null or p_division_id is null
    or (p_reason is not null and length(p_reason)>500)
    or v_enrolled_on>current_date then
    raise exception 'Invalid enrollment data or future enrollment date' using errcode='22023';
  end if;

  select s.status into v_student_status
  from public.students s
  where s.id=p_student_id and s.institution_id=p_institution_id
  for update;
  if not found then
    raise exception 'Student not found' using errcode='P0002';
  end if;
  if v_student_status<>'active' then
    raise exception 'Only active student records can be enrolled' using errcode='23514';
  end if;
  if exists (
    select 1 from public.enrollments e
    where e.institution_id=p_institution_id
      and e.student_id=p_student_id
      and e.status='active'
      and e.ended_on is null
  ) then
    raise exception 'Student already has an active enrollment; use transfer or close it first' using errcode='23505';
  end if;

  perform private.assert_division_available_for_enrollment(
    p_institution_id,p_division_id,v_enrolled_on
  );

  insert into public.enrollments(
    institution_id,student_id,division_id,enrolled_on,status,ended_on
  )
  values(p_institution_id,p_student_id,p_division_id,v_enrolled_on,'active',null)
  returning id into v_enrollment_id;

  insert into public.enrollment_events(
    institution_id,student_id,enrollment_id,actor_membership_id,event_type,
    effective_on,to_division_id,reason
  ) values (
    p_institution_id,p_student_id,v_enrollment_id,v_membership_id,'enrolled',
    v_enrolled_on,p_division_id,nullif(btrim(p_reason),'')
  );
  return v_enrollment_id;
end;
$function$;

create or replace function private.transfer_student_enrollment_impl(
  p_institution_id uuid,
  p_student_id uuid,
  p_new_division_id uuid,
  p_effective_on date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_student_status text;
  v_old public.enrollments%rowtype;
  v_new_enrollment_id uuid;
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
    or not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if p_student_id is null or p_new_division_id is null or p_effective_on is null
    or p_effective_on>current_date
    or (p_reason is not null and length(p_reason)>500) then
    raise exception 'Invalid transfer data or future transfer date' using errcode='22023';
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
  where e.institution_id=p_institution_id
    and e.student_id=p_student_id
    and e.status='active'
    and e.ended_on is null
  order by e.enrolled_on desc
  limit 1
  for update;
  if not found then
    raise exception 'Student has no active enrollment to transfer' using errcode='P0002';
  end if;
  if p_effective_on<=v_old.enrolled_on then
    raise exception 'Transfer date must be after the current enrollment start' using errcode='22023';
  end if;
  if p_new_division_id=v_old.division_id then
    raise exception 'New division must differ from current division' using errcode='23514';
  end if;

  perform private.assert_division_available_for_enrollment(
    p_institution_id,p_new_division_id,p_effective_on
  );

  update public.enrollments
  set status='transferred',ended_on=p_effective_on-1
  where id=v_old.id and institution_id=p_institution_id;

  insert into public.enrollments(
    institution_id,student_id,division_id,enrolled_on,status,ended_on
  )
  values(p_institution_id,p_student_id,p_new_division_id,p_effective_on,'active',null)
  returning id into v_new_enrollment_id;

  insert into public.enrollment_events(
    institution_id,student_id,enrollment_id,actor_membership_id,event_type,
    effective_on,from_division_id,to_division_id,reason
  ) values (
    p_institution_id,p_student_id,v_new_enrollment_id,v_membership_id,'transferred',
    p_effective_on,v_old.division_id,p_new_division_id,nullif(btrim(p_reason),'')
  );
  return v_new_enrollment_id;
end;
$function$;

create or replace function private.close_student_enrollment_impl(
  p_institution_id uuid,
  p_enrollment_id uuid,
  p_final_status text,
  p_effective_on date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_membership_id uuid;
  v_enrollment public.enrollments%rowtype;
  v_student_status text;
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
    or not private.has_institution_permission(p_institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;
  if p_final_status not in ('withdrawn','completed')
    or p_effective_on is null
    or p_effective_on>current_date
    or (p_reason is not null and length(p_reason)>500) then
    raise exception 'Invalid enrollment closure data or future end date' using errcode='22023';
  end if;

  select e.* into v_enrollment
  from public.enrollments e
  where e.id=p_enrollment_id and e.institution_id=p_institution_id
  for update;
  if not found then
    raise exception 'Enrollment not found' using errcode='P0002';
  end if;
  if v_enrollment.status<>'active' or v_enrollment.ended_on is not null then
    raise exception 'Only an active enrollment can be closed' using errcode='23514';
  end if;
  if p_effective_on<v_enrollment.enrolled_on then
    raise exception 'End date cannot precede enrollment start' using errcode='22023';
  end if;

  update public.enrollments
  set status=p_final_status,ended_on=p_effective_on
  where id=p_enrollment_id and institution_id=p_institution_id;

  v_student_status:=case when p_final_status='completed' then 'graduated' else 'withdrawn' end;
  update public.students
  set status=v_student_status,updated_at=now()
  where id=v_enrollment.student_id and institution_id=p_institution_id;

  insert into public.enrollment_events(
    institution_id,student_id,enrollment_id,actor_membership_id,event_type,
    effective_on,from_division_id,reason
  ) values (
    p_institution_id,v_enrollment.student_id,p_enrollment_id,v_membership_id,p_final_status,
    p_effective_on,v_enrollment.division_id,nullif(btrim(p_reason),'')
  );
  return p_enrollment_id;
end;
$function$;

create or replace function private.close_active_enrollment_on_student_exit()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor_membership_id uuid;
  v_enrollment public.enrollments%rowtype;
  v_event_type text;
  v_effective_on date;
begin
  if new.status is not distinct from old.status
    or new.status not in ('withdrawn','graduated') then
    return new;
  end if;
  if (select auth.uid()) is null then
    raise exception 'Authenticated actor required to close student enrollment' using errcode='28000';
  end if;

  select m.id into v_actor_membership_id
  from public.memberships m
  where m.user_id=(select auth.uid())
    and m.institution_id=new.institution_id
    and m.status='active'
  limit 1;
  if v_actor_membership_id is null
    or not private.has_institution_permission(new.institution_id,'students.manage') then
    raise exception 'Student management permission required' using errcode='42501';
  end if;

  select e.* into v_enrollment
  from public.enrollments e
  where e.institution_id=new.institution_id
    and e.student_id=new.id
    and e.status='active'
    and e.ended_on is null
  order by e.enrolled_on desc
  limit 1
  for update;

  if found then
    v_event_type:=case when new.status='graduated' then 'completed' else 'withdrawn' end;
    v_effective_on:=greatest(current_date,v_enrollment.enrolled_on);

    update public.enrollments
    set status=v_event_type,ended_on=v_effective_on
    where id=v_enrollment.id and institution_id=new.institution_id;

    insert into public.enrollment_events(
      institution_id,student_id,enrollment_id,actor_membership_id,event_type,
      effective_on,from_division_id,reason
    ) values (
      new.institution_id,new.id,v_enrollment.id,v_actor_membership_id,v_event_type,
      v_effective_on,v_enrollment.division_id,
      'Cierre automático por cambio de estado del legajo'
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists students_close_active_enrollment_on_exit on public.students;
create trigger students_close_active_enrollment_on_exit
after update of status on public.students
for each row
execute function private.close_active_enrollment_on_student_exit();

create index if not exists enrollments_active_by_division_idx
  on public.enrollments(institution_id,division_id)
  where status='active' and ended_on is null;

revoke all on function private.assert_division_available_for_enrollment(uuid,uuid,date) from public,anon,authenticated;
revoke all on function private.close_active_enrollment_on_student_exit() from public,anon,authenticated;
revoke insert,update,delete,truncate on table public.enrollments from public,anon,authenticated;
revoke all on table public.enrollment_events from public,anon,authenticated;
grant select on table public.enrollments to authenticated;
