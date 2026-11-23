-- Las notas cargadas desde el Aula Virtual deben ser enteros entre 1 y 10.
create or replace function private.validate_classroom_integer_grade()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_component text;
begin
 select a.classroom_component_key into v_component
 from public.assessments a
 where a.id=new.assessment_id and a.institution_id=new.institution_id;

 if v_component is not null then
   if new.score is not null and (new.score < 1 or new.score > 10 or new.score <> trunc(new.score)) then
     raise exception 'Las notas del Aula Virtual deben ser números enteros del 1 al 10'
       using errcode='22023';
   end if;
 end if;
 return new;
end;
$$;

revoke all on function private.validate_classroom_integer_grade() from public, anon, authenticated;

drop trigger if exists classroom_integer_grade_guard on public.grade_records;
create trigger classroom_integer_grade_guard
before insert or update of score, assessment_id, institution_id
on public.grade_records
for each row execute function private.validate_classroom_integer_grade();
