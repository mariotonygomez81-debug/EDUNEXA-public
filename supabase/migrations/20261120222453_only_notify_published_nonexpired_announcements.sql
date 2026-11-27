CREATE OR REPLACE FUNCTION private.fanout_announcement_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.published_at is null
    or new.published_at>now()
    or (new.expires_at is not null and new.expires_at<=now()) then
    return new;
  end if;

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
$function$


revoke all on function private.fanout_announcement_notification() from public,anon,authenticated;
