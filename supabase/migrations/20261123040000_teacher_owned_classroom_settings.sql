-- Teacher-owned classroom metadata updates. Academic links and ownership remain immutable.
create or replace function private.update_teacher_owned_classroom_impl(
  p_classroom_id uuid, p_title text, p_description text
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_membership_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_title is null or length(btrim(p_title)) not between 3 and 160 or coalesce(length(p_description),0)>2000 then
    raise exception 'Invalid classroom details' using errcode='22023';
  end if;
  select m.id into v_membership_id
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=v_user_id and m.status='active' and r.key='teacher'
    and exists(select 1 from public.virtual_classrooms vc where vc.id=p_classroom_id
      and vc.institution_id=m.institution_id and (vc.owner_membership_id=m.id or vc.created_by=v_user_id))
  limit 1;
  if v_membership_id is null then raise exception 'Only the classroom owner can update it' using errcode='42501'; end if;
  update public.virtual_classrooms set title=btrim(p_title),description=nullif(btrim(p_description),'')
    where id=p_classroom_id and owner_membership_id=v_membership_id;
  if not found then raise exception 'Classroom ownership could not be verified' using errcode='42501'; end if;
end;
$function$;
revoke all on function private.update_teacher_owned_classroom_impl(uuid,text,text) from public,anon;
grant execute on function private.update_teacher_owned_classroom_impl(uuid,text,text) to authenticated;
create or replace function public.update_teacher_owned_classroom(p_classroom_id uuid,p_title text,p_description text)
returns void language sql security invoker set search_path = ''
as $function$ select private.update_teacher_owned_classroom_impl(p_classroom_id,p_title,p_description); $function$;
revoke all on function public.update_teacher_owned_classroom(uuid,text,text) from public,anon;
grant execute on function public.update_teacher_owned_classroom(uuid,text,text) to authenticated;
