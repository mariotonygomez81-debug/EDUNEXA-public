import { gradeClassroomSubmission, updateClassroomSubmissionReviewStatus } from "./actions";
import AjaxForm from "./ajax-form";

export type ClassroomAssignmentRosterRow = {
  assignment_id: string;
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_number: string | null;
  submission_id: string | null;
  submitted: boolean;
  submitted_at: string | null;
  body: string | null;
  review_status: "visto" | "aprobado" | "desaprobado" | "corregir" | null;
  score: number | null;
  feedback: string | null;
};

const statusLabels: Record<string, string> = {
  visto: "Visto",
  aprobado: "Aprobado",
  desaprobado: "Desaprobado",
  corregir: "Necesita corrección",
};

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha registrada";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ClassroomAssignmentRoster({
  rows, files, historyBySubmission, slug, classroomId, assignmentId, maxScore, dueAt, asOf,
}: {
  rows: ClassroomAssignmentRosterRow[];
  files: { file_id: string; submission_id: string | null; original_filename: string; signedUrl: string | null }[];
  historyBySubmission: Record<string, {
    revisions?: { revision_number: number; body: string | null; file_path: string | null; submitted_at: string | null; changed_at: string }[];
    grades?: { previous_score: number | null; new_score: number | null; previous_feedback: string | null; new_feedback: string | null; changed_at: string }[];
  } | null>;
  slug: string;
  classroomId: string;
  assignmentId: string;
  maxScore: number | null;
  dueAt: string | null;
  asOf: string;
}) {
  const students = rows.filter((row) => row.assignment_id === assignmentId);
  const submitted = students.filter((row) => row.submitted);
  const pending = students.length - submitted.length;
  const reviewed = submitted.filter((row) => row.review_status !== null).length;
  const graded = submitted.filter((row) => row.score !== null).length;
  const deadline = dueAt ? new Date(dueAt).getTime() : null;
  const now = new Date(asOf).getTime();
  const isLate = (row: ClassroomAssignmentRosterRow) => deadline !== null && (
    row.submitted
      ? Boolean(row.submitted_at && new Date(row.submitted_at).getTime() > deadline)
      : deadline < now
  );
  const late = students.filter(isLate).length;

  return (
    <section className="mt-5 border-t border-slate-200 pt-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-indigo-50 p-2 text-indigo-700">✓</span>
              <h4 className="text-base font-bold text-slate-900">Seguimiento y corrección</h4>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Revisá cada entrega, calificá y enviá una devolución desde la ficha del estudiante.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {students.length} estudiantes
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-2xl font-bold tabular-nums text-emerald-800">{submitted.length}</p>
            <p className="text-xs font-medium text-emerald-700">Entregadas</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <p className="text-2xl font-bold tabular-nums text-amber-800">{pending}</p>
            <p className="text-xs font-medium text-amber-700">Pendientes</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
            <p className="text-2xl font-bold tabular-nums text-rose-800">{late}</p>
            <p className="text-xs font-medium text-rose-700">Con atraso</p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
            <p className="text-2xl font-bold tabular-nums text-sky-800">{reviewed}</p>
            <p className="text-xs font-medium text-sky-700">Revisadas</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
            <p className="text-2xl font-bold tabular-nums text-violet-800">{graded}</p>
            <p className="text-xs font-medium text-violet-700">Calificadas</p>
          </div>
        </div>
      </div>

      {students.length ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(120px,0.8fr)_minmax(150px,1fr)_minmax(190px,1.2fr)] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 md:grid">
            <span>Estudiante</span><span>Entrega</span><span>Revisión / nota</span><span>Actualizar estado</span>
          </div>
          <div className="divide-y divide-slate-100">
            {students.map((row) => (
              <div key={row.student_id} className="p-4 transition-colors hover:bg-slate-50/70">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(120px,0.8fr)_minmax(150px,1fr)_minmax(190px,1.2fr)] md:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{row.student_last_name}, {row.student_first_name}</p>
                    {row.student_number ? <p className="mt-0.5 text-xs text-slate-400">Legajo {row.student_number}</p> : null}
                  </div>
                  <div>
                    {row.submitted ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Entregado</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Pendiente</span>
                    )}
                    {isLate(row) ? <span className="ml-1 inline-flex rounded-full bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700">Atraso</span> : null}
                    {row.submitted_at ? <p className="mt-1 text-xs text-slate-400">{dateLabel(row.submitted_at)}</p> : null}
                  </div>
                  <div className="space-y-1">
                    {row.submitted ? (
                      <>
                        <p className="text-sm font-semibold text-slate-700">{row.review_status ? statusLabels[row.review_status] : "Pendiente de revisión"}</p>
                        {row.score !== null ? <span className="inline-flex rounded-md bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">Nota: {row.score}{maxScore !== null ? ` / ${maxScore}` : ""}</span> : <p className="text-xs text-slate-400">Sin calificación</p>}
                      </>
                    ) : <span className="text-xs text-slate-400">Aún no hay trabajo para revisar</span>}
                  </div>
                  <div>
                    {row.submitted && row.submission_id ? (
                      <AjaxForm action={updateClassroomSubmissionReviewStatus} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="classroom_id" value={classroomId} />
                        <input type="hidden" name="submission_id" value={row.submission_id} />
                        <select name="review_status" defaultValue={row.review_status ?? "pending"} aria-label={`Estado de revisión de ${row.student_first_name} ${row.student_last_name}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
                          <option value="pending">Pendiente</option><option value="visto">Visto</option><option value="aprobado">Aprobado</option><option value="desaprobado">Desaprobado</option><option value="corregir">Corregir</option>
                        </select>
                        <button className="rounded-lg border border-violet-200 bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-950 transition hover:bg-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">Guardar</button>
                      </AjaxForm>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </div>
                </div>

                {row.submitted && row.submission_id ? (
                  <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50/70">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-indigo-700 marker:hidden">
                      <span>Ver trabajo, calificar y devolver</span><span className="transition-transform group-open:rotate-180">⌄</span>
                    </summary>
                    <div className="space-y-4 border-t border-slate-200 px-3 py-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Respuesta del estudiante</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{row.body?.trim() || "La entrega no contiene texto. Puede incluir archivos adjuntos."}</p>
                        {files.filter((file) => file.submission_id === row.submission_id).length ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Archivos adjuntos</p>
                            {files.filter((file) => file.submission_id === row.submission_id).map((file) => (
                              <div key={file.file_id} className="flex flex-wrap items-center gap-2 text-sm">
                                {file.signedUrl ? (
                                  <a href={file.signedUrl} className="font-semibold text-indigo-700 underline underline-offset-2" rel="noreferrer">
                                    Descargar {file.original_filename}
                                  </a>
                                ) : (
                                  <span className="text-slate-500">Archivo no disponible: {file.original_filename}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Calificación y devolución</p>
                          {row.score !== null ? <span className="text-xs font-bold text-emerald-700">Nota actual: {row.score}%</span> : <span className="text-xs text-slate-400">Sin calificar</span>}
                        </div>
                        <AjaxForm action={gradeClassroomSubmission} className="grid gap-3 sm:grid-cols-[minmax(120px,0.35fr)_minmax(0,1fr)]">
                          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="classroom_id" value={classroomId} /><input type="hidden" name="submission_id" value={row.submission_id} />
                          {maxScore !== null ? <label className="block text-sm font-medium text-slate-700">Nota (%)
                            <input name="score" type="number" required min="0" max={maxScore} step="0.01" defaultValue={row.score ?? ""} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" />
                          </label> : <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">Actividad sin calificación numérica. Podés enviar una devolución cualitativa.</p>}
                          <label className="block text-sm font-medium text-slate-700">Devolución para el estudiante
                            <textarea name="feedback" maxLength={5000} rows={3} defaultValue={row.feedback ?? ""} placeholder="Escribí observaciones, logros y aspectos para mejorar…" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" />
                          </label>
                          <div className="sm:col-span-2"><button className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">{maxScore !== null ? "Guardar calificación y devolución" : "Enviar devolución"}</button></div>
                        </AjaxForm>
                        {row.feedback ? <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">{row.feedback}</p> : null}
                        {(() => {
                          const history = historyBySubmission[row.submission_id!] ?? null;
                          const revisions = history?.revisions ?? [];
                          const gradeEvents = history?.grades ?? [];
                          if (!revisions.length && !gradeEvents.length) return null;
                          return (
                            <details className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                              <summary className="cursor-pointer text-sm font-semibold text-indigo-800">
                                Historial de cambios · {revisions.length} versiones · {gradeEvents.length} cambios de calificación
                              </summary>
                              <div className="mt-3 space-y-3">
                                {revisions.map((revision) => (
                                  <article key={`revision-${revision.revision_number}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-xs font-bold text-slate-700">Versión anterior #{revision.revision_number}</p>
                                    <p className="mt-1 text-xs text-slate-500">{dateLabel(revision.changed_at)}</p>
                                    {revision.body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{revision.body}</p> : null}
                                    {revision.file_path ? <p className="mt-1 break-all text-xs text-slate-400">Referencia de archivo histórica registrada</p> : null}
                                  </article>
                                ))}
                                {gradeEvents.map((event, index) => (
                                  <article key={`grade-${event.changed_at}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-xs font-bold text-slate-700">Cambio de calificación</p>
                                    <p className="mt-1 text-xs text-slate-500">{dateLabel(event.changed_at)}</p>
                                    <p className="mt-2 text-sm text-slate-700">Nota: {event.previous_score ?? "Sin nota"} → {event.new_score ?? "Sin nota"}</p>
                                    {event.previous_feedback || event.new_feedback ? <div className="mt-2 grid gap-2 sm:grid-cols-2"><p className="whitespace-pre-wrap text-xs text-slate-500"><strong>Devolución anterior:</strong> {event.previous_feedback || "Sin devolución"}</p><p className="whitespace-pre-wrap text-xs text-slate-700"><strong>Devolución nueva:</strong> {event.new_feedback || "Sin devolución"}</p></div> : null}
                                  </article>
                                ))}
                              </div>
                            </details>
                          );
                        })()}
                      </div>
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No hay estudiantes activos matriculados en esta aula.</p>}
    </section>
  );
}
