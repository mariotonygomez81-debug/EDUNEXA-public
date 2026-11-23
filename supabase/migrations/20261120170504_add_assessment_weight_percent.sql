alter table public.assessments
  add column if not exists weight_percent numeric(5,2);

alter table public.assessments
  add constraint assessments_weight_percent_check
  check (weight_percent is null or (weight_percent > 0 and weight_percent <= 100));

create or replace function private.enforce_assessment_weight_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_total numeric;
begin
  if new.weight_percent is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    new.institution_id::text || ':' || new.division_id::text || ':' ||
    new.course_subject_id::text || ':' || new.grading_period_id::text, 0
  ));

  select coalesce(sum(a.weight_percent), 0)
    into existing_total
  from public.assessments a
  where a.institution_id = new.institution_id
    and a.division_id = new.division_id
    and a.course_subject_id = new.course_subject_id
    and a.grading_period_id = new.grading_period_id
    and a.weight_percent is not null
    and a.id <> new.id;

  if existing_total + new.weight_percent > 100 then
    raise exception 'La suma de ponderaciones no puede superar el 100%%'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists assessments_weight_total_guard on public.assessments;
create trigger assessments_weight_total_guard
before insert or update of weight_percent, institution_id, division_id, course_subject_id, grading_period_id
on public.assessments
for each row execute function private.enforce_assessment_weight_total();

revoke all on function private.enforce_assessment_weight_total() from public, anon;
grant execute on function private.enforce_assessment_weight_total() to authenticated;
