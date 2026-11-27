CREATE OR REPLACE FUNCTION private.create_report_card_snapshot_on_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_snapshot jsonb;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    select jsonb_build_object(
      'schema_version', 2,
      'workflow_version', new.version_number,
      'supersedes_workflow_id', new.supersedes_workflow_id,
      'rectification_reason', new.rectification_reason,
      'published_at', new.published_at,
      'published_by_membership_id', new.published_by_membership_id,
      'institution', jsonb_build_object(
        'id', i.id,
        'display_name', i.display_name,
        'legal_name', i.legal_name,
        'tax_id', i.tax_id
      ),
      'student', jsonb_build_object(
        'id', st.id,
        'first_name', st.first_name,
        'last_name', st.last_name,
        'student_number', st.student_number
      ),
      'period', jsonb_build_object(
        'id', gp.id,
        'name', gp.name,
        'starts_on', gp.starts_on,
        'ends_on', gp.ends_on
      ),
      'academic_year', jsonb_build_object(
        'id', ay.id,
        'name', ay.name,
        'starts_on', ay.starts_on,
        'ends_on', ay.ends_on
      ),
      'grading_scale', case when gs.id is null then null else jsonb_build_object(
        'id', gs.id,
        'name', gs.name,
        'display_mode', gs.display_mode,
        'minimum_value', gs.minimum_value,
        'maximum_value', gs.maximum_value,
        'passing_value', gs.passing_value,
        'levels', coalesce((
          select jsonb_agg(jsonb_build_object(
            'minimum_percentage', gsl.minimum_percentage,
            'maximum_percentage', gsl.maximum_percentage,
            'label', gsl.label,
            'grade_value', gsl.grade_value,
            'is_passing', gsl.is_passing,
            'sort_order', gsl.sort_order
          ) order by gsl.sort_order)
          from public.grading_scale_levels gsl
          where gsl.grading_scale_id = gs.id
            and gsl.institution_id = new.institution_id
        ), '[]'::jsonb)
      ) end,
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object(
          'subject', sub.name,
          'course', c.name,
          'division', d.name,
          'assessments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'title', a.title,
              'date', a.assessment_date,
              'maximum_score', a.max_score,
              'weight_percent', a.weight_percent,
              'score', gr.score,
              'comment', gr.comment
            ) order by a.assessment_date nulls last, a.title)
            from public.assessments a
            left join public.grade_records gr
              on gr.assessment_id = a.id
             and gr.student_id = new.student_id
             and gr.institution_id = new.institution_id
            where a.course_subject_id = cs.id
              and a.division_id = d.id
              and a.grading_period_id = new.grading_period_id
              and a.institution_id = new.institution_id
          ), '[]'::jsonb)
        ) order by sub.name, c.name, d.name)
        from public.enrollments e
        join public.divisions d
          on d.id = e.division_id and d.institution_id = e.institution_id
        join public.courses c
          on c.id = d.course_id and c.institution_id = d.institution_id
        join public.course_subjects cs
          on cs.course_id = c.id and cs.institution_id = c.institution_id
        join public.subjects sub
          on sub.id = cs.subject_id and sub.institution_id = cs.institution_id
        where e.institution_id = new.institution_id
          and e.student_id = new.student_id
          and e.enrolled_on <= gp.ends_on
          and (e.ended_on is null or e.ended_on >= gp.starts_on)
          and d.academic_year_id = gp.academic_year_id
          and exists (
            select 1 from public.assessments ax
            where ax.course_subject_id = cs.id
              and ax.division_id = d.id
              and ax.grading_period_id = new.grading_period_id
              and ax.institution_id = new.institution_id
          )
      ), '[]'::jsonb),
      'general_observation', (
        select spo.observation
        from public.student_period_observations spo
        where spo.institution_id = new.institution_id
          and spo.student_id = new.student_id
          and spo.grading_period_id = new.grading_period_id
        limit 1
      )
    )
    into v_snapshot
    from public.institutions i
    join public.students st
      on st.id = new.student_id and st.institution_id = new.institution_id
    join public.grading_periods gp
      on gp.id = new.grading_period_id and gp.institution_id = new.institution_id
    join public.academic_years ay
      on ay.id = gp.academic_year_id and ay.institution_id = new.institution_id
    left join public.grading_scales gs
      on gs.id = ay.grading_scale_id and gs.institution_id = new.institution_id
    where i.id = new.institution_id;

    if v_snapshot is null then
      raise exception 'Unable to create report card snapshot for workflow %', new.id;
    end if;

    insert into public.report_card_snapshots (
      workflow_id, institution_id, student_id, grading_period_id, snapshot
    ) values (
      new.id, new.institution_id, new.student_id, new.grading_period_id, v_snapshot
    );
  end if;

  return new;
end;
$function$
;