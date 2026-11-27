-- Preserve human-readable orientation labels and enforce immutable course history.
alter table public.course_orientation_history
 add column if not exists previous_orientation_name text,
 add column if not exists new_orientation_name text;

update public.course_orientation_history h
set previous_orientation_name=coalesce(h.previous_orientation_name,o.name,'Sin orientación')
from (select h2.id,o.name from public.course_orientation_history h2 left join public.education_orientations o on o.id=h2.previous_orientation_id) o
where h.id=o.id and h.previous_orientation_name is null;

update public.course_orientation_history h
set new_orientation_name=coalesce(h.new_orientation_name,o.name,'Sin orientación')
from (select h2.id,o.name from public.course_orientation_history h2 left join public.education_orientations o on o.id=h2.new_orientation_id) o
where h.id=o.id and h.new_orientation_name is null;

create or replace function private.snapshot_course_orientation_labels()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 new.previous_orientation_name:=coalesce((select o.name from public.education_orientations o where o.id=new.previous_orientation_id and o.institution_id=new.institution_id),'Sin orientación');
 new.new_orientation_name:=coalesce((select o.name from public.education_orientations o where o.id=new.new_orientation_id and o.institution_id=new.institution_id),'Sin orientación');
 return new;
end;
$function$;
revoke all on function private.snapshot_course_orientation_labels() from public,anon,authenticated;
drop trigger if exists course_orientation_history_snapshot_labels on public.course_orientation_history;
create trigger course_orientation_history_snapshot_labels
before insert on public.course_orientation_history
for each row execute function private.snapshot_course_orientation_labels();

create or replace function private.prevent_course_orientation_history_mutation()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 raise exception 'Course orientation history is append-only' using errcode='55000';
end;
$function$;
revoke all on function private.prevent_course_orientation_history_mutation() from public,anon,authenticated;
drop trigger if exists course_orientation_history_no_update on public.course_orientation_history;
create trigger course_orientation_history_no_update
before update or delete on public.course_orientation_history
for each row execute function private.prevent_course_orientation_history_mutation();

alter table public.course_orientation_history
 drop constraint if exists course_orientation_history_course_fk;
alter table public.course_orientation_history
 add constraint course_orientation_history_course_fk
 foreign key(course_id,institution_id)
 references public.courses(id,institution_id) on delete restrict;

create or replace function public.list_institution_course_orientation_history(
 p_institution_id uuid,p_limit_per_course integer default 15
) returns table(
 course_id uuid,course_name text,history_id bigint,
 previous_orientation_name text,new_orientation_name text,
 actor_user_id uuid,actor_name text,changed_at timestamptz
)
language plpgsql security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not private.has_institution_permission(p_institution_id,'institution.manage') then
  raise exception 'Institution administration permission required' using errcode='42501';
 end if;
 if p_limit_per_course<1 or p_limit_per_course>50 then raise exception 'Invalid history limit' using errcode='22023'; end if;
 return query
 with ranked as (
  select h.course_id,c.name as course_name,h.id,h.previous_orientation_name,h.new_orientation_name,
   m.user_id as actor_user_id,
   coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email,'Usuario')::text as actor_name,
   h.changed_at,
   row_number() over(partition by h.course_id order by h.changed_at desc,h.id desc) as rn
  from public.course_orientation_history h
  join public.courses c on c.id=h.course_id and c.institution_id=h.institution_id
  join public.memberships m on m.id=h.actor_membership_id and m.institution_id=h.institution_id
  left join auth.users u on u.id=m.user_id
  where h.institution_id=p_institution_id
 )
 select r.course_id,r.course_name,r.id,r.previous_orientation_name,r.new_orientation_name,
  r.actor_user_id,r.actor_name,r.changed_at
 from ranked r where r.rn<=p_limit_per_course
 order by r.course_name,r.changed_at desc,r.id desc;
end;
$function$;
revoke all on function public.list_institution_course_orientation_history(uuid,integer) from public,anon;
grant execute on function public.list_institution_course_orientation_history(uuid,integer) to authenticated;
