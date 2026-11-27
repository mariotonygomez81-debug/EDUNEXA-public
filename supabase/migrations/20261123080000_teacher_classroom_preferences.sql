create table if not exists private.teacher_classroom_preferences (
  classroom_id uuid not null references public.virtual_classrooms(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  accent_theme text not null default 'indigo' check (accent_theme in ('indigo','ocean','emerald','sunset','violet')),
  layout_density text not null default 'comfortable' check (layout_density in ('comfortable','compact')),
  default_section text not null default 'news' check (default_section in ('news','work','people','attendance','grades')),
  show_header_stats boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (classroom_id,membership_id)
);

revoke all on table private.teacher_classroom_preferences from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.get_teacher_classroom_preferences_impl(p_classroom_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_membership_id uuid; v_preferences private.teacher_classroom_preferences%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select m.id into v_membership_id from public.memberships m
  join public.virtual_classrooms vc on vc.institution_id=m.institution_id and vc.id=p_classroom_id
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
    and private.can_access_classroom(p_classroom_id,vc.institution_id,'classroom.read') limit 1;
  if v_membership_id is null then raise exception 'Teacher classroom access denied' using errcode='42501'; end if;
  select * into v_preferences from private.teacher_classroom_preferences where classroom_id=p_classroom_id and membership_id=v_membership_id;
  return jsonb_build_object('accent_theme',coalesce(v_preferences.accent_theme,'indigo'),
    'layout_density',coalesce(v_preferences.layout_density,'comfortable'),
    'default_section',coalesce(v_preferences.default_section,'news'),
    'show_header_stats',coalesce(v_preferences.show_header_stats,true));
end;
$function$;

create or replace function public.get_teacher_classroom_preferences(p_classroom_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $function$ select private.get_teacher_classroom_preferences_impl(p_classroom_id); $function$;

create or replace function private.update_teacher_classroom_preferences_impl(
  p_classroom_id uuid,p_accent_theme text,p_layout_density text,p_default_section text,p_show_header_stats boolean
) returns void language plpgsql security definer set search_path=''
as $function$
declare v_membership_id uuid; v_institution_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_accent_theme not in ('indigo','ocean','emerald','sunset','violet')
    or p_layout_density not in ('comfortable','compact')
    or p_default_section not in ('news','work','people','attendance','grades')
    or p_show_header_stats is null then raise exception 'Invalid classroom preferences' using errcode='22023'; end if;
  select m.id,vc.institution_id into v_membership_id,v_institution_id
  from public.memberships m join public.virtual_classrooms vc on vc.institution_id=m.institution_id and vc.id=p_classroom_id
  join public.membership_roles mr on mr.membership_id=m.id and mr.institution_id=m.institution_id
  join public.roles r on r.id=mr.role_id
  where m.user_id=(select auth.uid()) and m.status='active' and r.key='teacher'
    and private.can_access_classroom(p_classroom_id,vc.institution_id,'classroom.read') limit 1;
  if v_membership_id is null then raise exception 'Teacher classroom access denied' using errcode='42501'; end if;
  if p_default_section='attendance' and not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.attendance.manage') then p_default_section:='news';
  elsif p_default_section='grades' and not private.can_access_classroom(p_classroom_id,v_institution_id,'classroom.grade') then p_default_section:='news'; end if;
  insert into private.teacher_classroom_preferences(classroom_id,membership_id,accent_theme,layout_density,default_section,show_header_stats,updated_at)
  values(p_classroom_id,v_membership_id,p_accent_theme,p_layout_density,p_default_section,p_show_header_stats,now())
  on conflict(classroom_id,membership_id) do update set accent_theme=excluded.accent_theme,
    layout_density=excluded.layout_density,default_section=excluded.default_section,
    show_header_stats=excluded.show_header_stats,updated_at=now();
end;
$function$;

create or replace function public.update_teacher_classroom_preferences(
  p_classroom_id uuid,p_accent_theme text,p_layout_density text,p_default_section text,p_show_header_stats boolean
) returns void language sql security invoker set search_path=''
as $function$ select private.update_teacher_classroom_preferences_impl(p_classroom_id,p_accent_theme,p_layout_density,p_default_section,p_show_header_stats); $function$;

revoke all on function private.get_teacher_classroom_preferences_impl(uuid) from public,anon;
revoke all on function private.update_teacher_classroom_preferences_impl(uuid,text,text,text,boolean) from public,anon;
grant execute on function private.get_teacher_classroom_preferences_impl(uuid) to authenticated;
grant execute on function private.update_teacher_classroom_preferences_impl(uuid,text,text,text,boolean) to authenticated;
revoke all on function public.get_teacher_classroom_preferences(uuid) from public,anon;
revoke all on function public.update_teacher_classroom_preferences(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.get_teacher_classroom_preferences(uuid) to authenticated;
grant execute on function public.update_teacher_classroom_preferences(uuid,text,text,text,boolean) to authenticated;
