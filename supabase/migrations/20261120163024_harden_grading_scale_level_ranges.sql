create or replace function private.prevent_grading_scale_level_overlap()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  conflicting_level uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.grading_scale_id::text, 0)
  );

  select level.id
    into conflicting_level
  from public.grading_scale_levels as level
  where level.grading_scale_id = new.grading_scale_id
    and level.institution_id = new.institution_id
    and level.id is distinct from new.id
    and pg_catalog.numrange(level.minimum_percentage, level.maximum_percentage, '[]')
        && pg_catalog.numrange(new.minimum_percentage, new.maximum_percentage, '[]')
  limit 1;

  if conflicting_level is not null then
    raise exception 'The percentage range overlaps another level in this grading scale'
      using errcode = '23P01';
  end if;

  return new;
end;
$function$;

revoke all on function private.prevent_grading_scale_level_overlap() from public, anon;
grant execute on function private.prevent_grading_scale_level_overlap() to authenticated;

drop trigger if exists grading_scale_levels_prevent_overlap on public.grading_scale_levels;
create trigger grading_scale_levels_prevent_overlap
before insert on public.grading_scale_levels
for each row execute function private.prevent_grading_scale_level_overlap();

revoke update, delete on public.grading_scales from authenticated;
revoke update, delete on public.grading_scale_levels from authenticated;
