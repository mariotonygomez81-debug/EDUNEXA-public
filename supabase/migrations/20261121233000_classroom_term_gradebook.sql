-- Planilla trimestral del Aula Virtual: cinco notas, conducta e indicadores de seguimiento.
alter table public.assessments add column if not exists classroom_component_key text;
alter table public.assessments drop constraint if exists assessments_classroom_component_key_check;
alter table public.assessments add constraint assessments_classroom_component_key_check
  check (classroom_component_key is null or classroom_component_key in ('orientadora_1','orientadora_2','orientadora_3','trimestral','recuperacion'));
create unique index if not exists assessments_classroom_component_unique
  on public.assessments(institution_id,division_id,course_subject_id,grading_period_id,classroom_component_key)
  where classroom_component_key is not null;

create table if not exists public.classroom_term_feedback (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  classroom_id uuid not null references public.virtual_classrooms(id) on delete cascade,
  grading_period_id uuid not null references public.grading_periods(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  conduct text check (conduct is null or conduct in ('regular','buena','muy_buena','excelente')),
  participates_in_class boolean not null default false,
  submits_practical_work boolean not null default false,
  demonstrates_interest boolean not null default false,
  observation text check (observation is null or length(observation)<=3000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(classroom_id,grading_period_id,student_id),
  foreign key(classroom_id,institution_id) references public.virtual_classrooms(id,institution_id) on delete cascade,
  foreign key(student_id,institution_id) references public.students(id,institution_id) on delete cascade,
  foreign key(grading_period_id,institution_id) references public.grading_periods(id,institution_id) on delete cascade
);
alter table public.classroom_term_feedback enable row level security;
revoke all on public.classroom_term_feedback from public,anon,authenticated;

create table if not exists public.classroom_term_feedback_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  classroom_id uuid not null,
  grading_period_id uuid not null,
  student_id uuid not null,
  actor_membership_id uuid not null references public.memberships(id),
  old_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.classroom_term_feedback_events enable row level security;
revoke all on public.classroom_term_feedback_events from public,anon,authenticated;

create or replace function private.list_classroom_term_periods_impl(p_classroom_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_user_id uuid := (select auth.uid()); v_institution_id uuid; v_year_id uuid; v_division_id uuid; v_subject_id uuid;
begin
 if v_user_id is null then raise exception 'Autenticación requerida'; end if;
 select vc.institution_id,vc.division_id,vc.course_subject_id,d.academic_year_id
 into v_institution_id,v_division_id,v_subject_id,v_year_id
 from public.virtual_classrooms vc join public.divisions d on d.id=vc.division_id and d.institution_id=vc.institution_id
 where vc.id=p_classroom_id;
 if v_institution_id is null or v_subject_id is null or not private.can_manage_course_subject(v_division_id,v_subject_id,v_institution_id,'grades.manage') then
   raise exception 'No tenés permiso para consultar los trimestres de esta aula' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',gp.id,'name',gp.name,'starts_on',gp.starts_on,'ends_on',gp.ends_on,'status',gp.status) order by gp.sort_order)
   from public.grading_periods gp where gp.institution_id=v_institution_id and gp.academic_year_id=v_year_id),'[]'::jsonb);
end; $$;

create or replace function public.list_classroom_term_periods(p_classroom_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.list_classroom_term_periods_impl(p_classroom_id); $$;

create or replace function private.list_classroom_term_gradebook_impl(p_classroom_id uuid,p_grading_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_user_id uuid := (select auth.uid()); v_institution_id uuid; v_division_id uuid; v_subject_id uuid;
 v_period jsonb; v_students jsonb;
begin
 if v_user_id is null then raise exception 'Autenticación requerida'; end if;
 select vc.institution_id,vc.division_id,vc.course_subject_id into v_institution_id,v_division_id,v_subject_id
 from public.virtual_classrooms vc where vc.id=p_classroom_id;
 if v_institution_id is null or v_subject_id is null then raise exception 'El aula debe tener una materia asignada'; end if;
 if not private.can_manage_course_subject(v_division_id,v_subject_id,v_institution_id,'grades.manage') then
   raise exception 'No tenés permiso para consultar las calificaciones de esta aula' using errcode='42501';
 end if;
 select jsonb_build_object('id',gp.id,'name',gp.name,'starts_on',gp.starts_on,'ends_on',gp.ends_on,'status',gp.status)
 into v_period from public.grading_periods gp join public.divisions d on d.academic_year_id=gp.academic_year_id and d.id=v_division_id
 where gp.id=p_grading_period_id and gp.institution_id=v_institution_id;
 if v_period is null then raise exception 'Trimestre no válido para esta aula'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows) order by rows.last_name,rows.first_name),'[]'::jsonb)
 into v_students from (
  select st.id as student_id,st.student_number,concat_ws(' ',st.last_name,st.first_name) as name,
   st.last_name,st.first_name,
   max(case when a.classroom_component_key='orientadora_1' then gr.score end) as orientadora_1,
   max(case when a.classroom_component_key='orientadora_2' then gr.score end) as orientadora_2,
   max(case when a.classroom_component_key='orientadora_3' then gr.score end) as orientadora_3,
   max(case when a.classroom_component_key='trimestral' then gr.score end) as trimestral,
   max(case when a.classroom_component_key='recuperacion' then gr.score end) as recuperacion,
   f.conduct,coalesce(f.participates_in_class,false) as participates_in_class,
   coalesce(f.submits_practical_work,false) as submits_practical_work,
   coalesce(f.demonstrates_interest,false) as demonstrates_interest,f.observation
  from public.enrollments e join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
  left join public.classroom_term_feedback f on f.classroom_id=p_classroom_id and f.grading_period_id=p_grading_period_id and f.student_id=st.id
  left join public.assessments a on a.institution_id=v_institution_id and a.division_id=v_division_id
   and a.course_subject_id=v_subject_id and a.grading_period_id=p_grading_period_id and a.classroom_component_key is not null
  left join public.grade_records gr on gr.assessment_id=a.id and gr.student_id=st.id and gr.institution_id=v_institution_id
  where e.institution_id=v_institution_id and e.division_id=v_division_id and e.enrolled_on<=(v_period->>'ends_on')::date
   and (e.ended_on is null or e.ended_on>=(v_period->>'starts_on')::date)
  group by st.id,st.student_number,st.last_name,st.first_name,f.conduct,f.participates_in_class,
   f.submits_practical_work,f.demonstrates_interest,f.observation
 ) rows;
 return jsonb_build_object('period',v_period,'students',v_students);
end; $$;

create or replace function public.list_classroom_term_gradebook(p_classroom_id uuid,p_grading_period_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.list_classroom_term_gradebook_impl(p_classroom_id,p_grading_period_id); $$;

create or replace function private.save_classroom_term_gradebook_impl(p_classroom_id uuid,p_grading_period_id uuid,p_rows jsonb)
returns integer language plpgsql volatile security definer set search_path=''
as $$
declare v_user_id uuid := (select auth.uid()); v_membership_id uuid; v_institution_id uuid;
 v_division_id uuid; v_subject_id uuid; v_period record; v_expected integer; v_received integer;
 v_row jsonb; v_student_id uuid; v_component text; v_score numeric; v_assessment_id uuid;
 v_old public.grade_records%rowtype; v_old_feedback jsonb; v_new_feedback jsonb; v_feedback_id uuid;
 v_changed integer:=0; v_conduct text; v_observation text;
begin
 if v_user_id is null then raise exception 'Autenticación requerida' using errcode='28000'; end if;
 select vc.institution_id,vc.division_id,vc.course_subject_id into v_institution_id,v_division_id,v_subject_id
 from public.virtual_classrooms vc where vc.id=p_classroom_id;
 if v_institution_id is null or v_subject_id is null then raise exception 'Aula o materia no encontrada'; end if;
 select gp.id as grading_period_id,gp.status,gp.starts_on,gp.ends_on into v_period
 from public.grading_periods gp join public.divisions d on d.academic_year_id=gp.academic_year_id and d.id=v_division_id
 where gp.id=p_grading_period_id and gp.institution_id=v_institution_id;
 if v_period.grading_period_id is null then raise exception 'El trimestre no corresponde al ciclo lectivo del aula'; end if;
 if v_period.status<>'open' then raise exception 'El trimestre está cerrado y no admite modificaciones'; end if;
 if not private.can_manage_course_subject(v_division_id,v_subject_id,v_institution_id,'grades.manage') then
   raise exception 'No tenés permiso para cargar notas en esta materia' using errcode='42501';
 end if;
 select m.id into v_membership_id from public.memberships m
 where m.user_id=v_user_id and m.institution_id=v_institution_id and m.status='active' limit 1;
 if v_membership_id is null then raise exception 'Membresía institucional inactiva'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>100 then
   raise exception 'La planilla debe contener entre 1 y 100 alumnos';
 end if;
 select count(*) into v_expected from public.enrollments e join public.students st on st.id=e.student_id and st.institution_id=e.institution_id
 where e.institution_id=v_institution_id and e.division_id=v_division_id and e.enrolled_on<=v_period.ends_on and (e.ended_on is null or e.ended_on>=v_period.starts_on);
 select count(distinct value->>'student_id') into v_received from jsonb_array_elements(p_rows);
 if v_received<>jsonb_array_length(p_rows) or v_received<>v_expected then
   raise exception 'La planilla debe incluir una sola fila por cada alumno matriculado del trimestre';
 end if;
 foreach v_component in array array['orientadora_1','orientadora_2','orientadora_3','trimestral','recuperacion']
 loop
  insert into public.assessments(institution_id,course_subject_id,division_id,grading_period_id,title,max_score,description,created_by,classroom_component_key)
  values(v_institution_id,v_subject_id,v_division_id,p_grading_period_id,
   case v_component when 'orientadora_1' then 'Nota orientadora 1' when 'orientadora_2' then 'Nota orientadora 2'
    when 'orientadora_3' then 'Nota orientadora 3' when 'trimestral' then 'Nota trimestral' else 'Recuperación' end,
   10,'Calificación de la planilla trimestral del Aula Virtual',v_user_id,v_component)
  on conflict(institution_id,division_id,course_subject_id,grading_period_id,classroom_component_key)
   where classroom_component_key is not null do nothing;
 end loop;
 for v_row in select value from jsonb_array_elements(p_rows)
 loop
  v_student_id:=nullif(v_row->>'student_id','')::uuid;
  if v_student_id is null or not exists(select 1 from public.enrollments e
   where e.institution_id=v_institution_id and e.division_id=v_division_id and e.student_id=v_student_id
    and e.enrolled_on<=v_period.ends_on and (e.ended_on is null or e.ended_on>=v_period.starts_on)) then
   raise exception 'La planilla contiene un alumno ajeno a esta división';
  end if;
  v_conduct:=nullif(v_row->>'conduct','');
  if v_conduct is not null and v_conduct not in ('regular','buena','muy_buena','excelente') then raise exception 'Concepto de conducta inválido'; end if;
  v_observation:=nullif(btrim(v_row->>'observation'),'');
  if length(coalesce(v_observation,''))>3000 then raise exception 'La observación supera los 3000 caracteres'; end if;
  foreach v_component in array array['orientadora_1','orientadora_2','orientadora_3','trimestral','recuperacion']
  loop
   v_score:=nullif(v_row->>v_component,'')::numeric;
   if v_score is not null and (v_score<1 or v_score>10) then raise exception 'Las notas deben ser valores entre 1 y 10'; end if;
   select id into v_assessment_id from public.assessments where institution_id=v_institution_id
    and division_id=v_division_id and course_subject_id=v_subject_id and grading_period_id=p_grading_period_id
    and classroom_component_key=v_component;
   select * into v_old from public.grade_records where institution_id=v_institution_id
    and assessment_id=v_assessment_id and student_id=v_student_id for update;
   if v_old.id is null then
    if v_score is not null then
     insert into public.grade_records(institution_id,assessment_id,student_id,score,entered_by)
      values(v_institution_id,v_assessment_id,v_student_id,v_score,v_user_id);
     insert into public.grade_record_events(institution_id,assessment_id,student_id,actor_membership_id,action,new_score)
      values(v_institution_id,v_assessment_id,v_student_id,v_membership_id,'created',v_score);
     v_changed:=v_changed+1;
    end if;
   elsif v_old.score is distinct from v_score then
    insert into public.grade_record_events(institution_id,assessment_id,student_id,actor_membership_id,action,old_score,new_score,change_reason)
     values(v_institution_id,v_assessment_id,v_student_id,v_membership_id,case when v_score is null then 'cleared' else 'updated' end,
      v_old.score,v_score,'Actualización de planilla trimestral del Aula Virtual');
    update public.grade_records set score=v_score,entered_by=v_user_id,updated_at=now() where id=v_old.id;
    v_changed:=v_changed+1;
   end if;
  end loop;
  select jsonb_build_object('conduct',conduct,'participates_in_class',participates_in_class,
   'submits_practical_work',submits_practical_work,'demonstrates_interest',demonstrates_interest,'observation',observation)
  into v_old_feedback from public.classroom_term_feedback
  where classroom_id=p_classroom_id and grading_period_id=p_grading_period_id and student_id=v_student_id for update;
  v_new_feedback:=jsonb_build_object('conduct',v_conduct,
   'participates_in_class',coalesce((v_row->>'participates_in_class')::boolean,false),
   'submits_practical_work',coalesce((v_row->>'submits_practical_work')::boolean,false),
   'demonstrates_interest',coalesce((v_row->>'demonstrates_interest')::boolean,false),'observation',v_observation);
  insert into public.classroom_term_feedback(institution_id,classroom_id,grading_period_id,student_id,conduct,
   participates_in_class,submits_practical_work,demonstrates_interest,observation,updated_by,updated_at)
  values(v_institution_id,p_classroom_id,p_grading_period_id,v_student_id,v_conduct,
   coalesce((v_row->>'participates_in_class')::boolean,false),coalesce((v_row->>'submits_practical_work')::boolean,false),
   coalesce((v_row->>'demonstrates_interest')::boolean,false),v_observation,v_user_id,now())
  on conflict(classroom_id,grading_period_id,student_id) do update set conduct=excluded.conduct,
   participates_in_class=excluded.participates_in_class,submits_practical_work=excluded.submits_practical_work,
   demonstrates_interest=excluded.demonstrates_interest,observation=excluded.observation,updated_by=excluded.updated_by,updated_at=now();
  if v_old_feedback is distinct from v_new_feedback then
   insert into public.classroom_term_feedback_events(institution_id,classroom_id,grading_period_id,student_id,
    actor_membership_id,old_values,new_values)
   values(v_institution_id,p_classroom_id,p_grading_period_id,v_student_id,v_membership_id,v_old_feedback,v_new_feedback);
  end if;
 end loop;
 return v_changed;
end; $$;

create or replace function public.save_classroom_term_gradebook(p_classroom_id uuid,p_grading_period_id uuid,p_rows jsonb)
returns integer language sql volatile security invoker set search_path=''
as $$ select private.save_classroom_term_gradebook_impl(p_classroom_id,p_grading_period_id,p_rows); $$;

revoke all on function public.list_classroom_term_periods(uuid) from public,anon;
revoke all on function public.list_classroom_term_gradebook(uuid,uuid) from public,anon;
revoke all on function public.save_classroom_term_gradebook(uuid,uuid,jsonb) from public,anon;
grant execute on function public.list_classroom_term_periods(uuid) to authenticated;
grant execute on function public.list_classroom_term_gradebook(uuid,uuid) to authenticated;
grant execute on function public.save_classroom_term_gradebook(uuid,uuid,jsonb) to authenticated;

-- Datos demostrativos para completar los tres trimestres del ciclo lectivo 2026 de Colegio Demo.
insert into public.grading_periods(institution_id,academic_year_id,name,starts_on,ends_on,sort_order,status)
select 'c05e3742-66f3-4df6-890a-eeccb443291f','828ddad7-9025-444d-992e-b6193e75cedf','Segundo trimestre','2026-06-01','2026-08-31',2,'open'
where not exists(select 1 from public.grading_periods where academic_year_id='828ddad7-9025-444d-992e-b6193e75cedf' and name='Segundo trimestre');
insert into public.grading_periods(institution_id,academic_year_id,name,starts_on,ends_on,sort_order,status)
select 'c05e3742-66f3-4df6-890a-eeccb443291f','828ddad7-9025-444d-992e-b6193e75cedf','Tercer trimestre','2026-09-01','2026-12-18',3,'open'
where not exists(select 1 from public.grading_periods where academic_year_id='828ddad7-9025-444d-992e-b6193e75cedf' and name='Tercer trimestre');
