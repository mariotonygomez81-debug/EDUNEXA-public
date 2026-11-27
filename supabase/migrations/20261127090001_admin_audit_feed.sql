create or replace function public.list_institution_admin_audit_events(
 p_institution_id uuid,p_limit integer default 50
) returns table(
 id bigint,actor_user_id uuid,action text,entity_type text,entity_id text,metadata jsonb,created_at timestamptz
) language plpgsql security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then
  raise exception 'Institution administration permission required' using errcode='42501';
 end if;
 if p_limit<1 or p_limit>100 then raise exception 'Invalid audit page size' using errcode='22023'; end if;
 return query
 select a.id,a.actor_user_id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at
 from public.audit_logs a
 where a.institution_id=p_institution_id
  and (a.action like 'institution.profile.%' or a.action like 'education.%'
   or a.action='students.bulk_imported' or a.action like 'academic_year.backup.%')
 order by a.created_at desc,a.id desc limit p_limit;
end;
$function$;
revoke all on function public.list_institution_admin_audit_events(uuid,integer) from public,anon;
grant execute on function public.list_institution_admin_audit_events(uuid,integer) to authenticated;
