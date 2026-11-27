"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Period = { id: string; name: string; starts_on: string; ends_on: string; status: "open" | "closed" };
type StudentRow = {
  student_id: string; student_number: string | null; name: string;
  orientadora_1: number | null; orientadora_2: number | null; orientadora_3: number | null;
  trimestral: number | null; recuperacion: number | null;
  conduct: string | null; participates_in_class: boolean; submits_practical_work: boolean;
  demonstrates_interest: boolean; observation: string | null;
};

const components = [
  ["orientadora_1", "Nota orientadora 1"],
  ["orientadora_2", "Nota orientadora 2"],
  ["orientadora_3", "Nota orientadora 3"],
  ["trimestral", "Nota trimestral"],
  ["recuperacion", "Recuperación"],
] as const;

export default function ClassroomTermGradebook({ classroomId }: { classroomId: string }) {
  const supabase = createClient();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadPeriods = async () => {
      const { data, error: rpcError } = await supabase.rpc("list_classroom_term_periods", {
        p_classroom_id: classroomId,
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
      const available = (data ?? []) as Period[];
      setPeriods(available);
      if (available.length) setPeriodId(available[0].id);
      else setLoading(false);
    };
    void loadPeriods();
    return () => { cancelled = true; };
  }, [classroomId, supabase]);

  useEffect(() => {
    if (!periodId) return;
    let cancelled = false;
    const loadGradebook = async () => {
      const { data, error: rpcError } = await supabase.rpc("list_classroom_term_gradebook", {
        p_classroom_id: classroomId,
        p_grading_period_id: periodId,
      });
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else {
        const payload = data as { students?: StudentRow[] } | null;
        setRows((payload?.students ?? []).map((row) => ({ ...row })));
      }
      setLoading(false);
    };
    void loadGradebook();
    return () => { cancelled = true; };
  }, [classroomId, periodId, supabase]);

  const activePeriod = periods.find((period) => period.id === periodId);
  const editable = activePeriod?.status === "open";

  function updateRow(studentId: string, patch: Partial<StudentRow>) {
    setRows((current) => current.map((row) => row.student_id === studentId ? { ...row, ...patch } : row));
    setNotice("");
  }

  async function saveGradebook() {
    if (!activePeriod || !editable) return;
    setSaving(true);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("save_classroom_term_gradebook", {
      p_classroom_id: classroomId,
      p_grading_period_id: periodId,
      p_rows: rows.map((row) => ({
        student_id: row.student_id,
        orientadora_1: row.orientadora_1,
        orientadora_2: row.orientadora_2,
        orientadora_3: row.orientadora_3,
        trimestral: row.trimestral,
        recuperacion: row.recuperacion,
        conduct: row.conduct,
        participates_in_class: row.participates_in_class,
        submits_practical_work: row.submits_practical_work,
        demonstrates_interest: row.demonstrates_interest,
        observation: row.observation,
      })),
    });
    if (rpcError) setError(rpcError.message);
    else setNotice("Planilla trimestral guardada correctamente.");
    setSaving(false);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <label htmlFor="classroom-term" className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Planilla del trimestre</label>
          <select id="classroom-term" value={periodId} onChange={(event) => { setLoading(true); setError(""); setPeriodId(event.target.value); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-800 sm:min-w-64">
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
          </select>
          {activePeriod ? <p className="mt-1 text-xs text-slate-500">{activePeriod.starts_on} al {activePeriod.ends_on}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activePeriod ? <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${editable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{editable ? "Trimestre abierto" : "Trimestre cerrado"}</span> : null}
          <button type="button" onClick={saveGradebook} disabled={!editable || loading || saving || rows.length === 0} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Guardando…" : "Guardar planilla"}</button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-bold text-slate-900">Seguimiento del aprendizaje</h3>
        <p className="mt-1 text-sm text-slate-500">Las notas son numéricas de 1 a 10. Los conceptos y las indicaciones cualitativas se guardan para cada alumno y trimestre.</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">Participa en clase</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">Entrega trabajos prácticos</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">Demuestra interés</span>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div> : null}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Cargando planilla trimestral…</div> :
        !periods.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No hay trimestres configurados para este ciclo lectivo.</div> :
        !rows.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No hay alumnos matriculados para este trimestre.</div> :
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="sticky left-0 z-10 min-w-56 bg-slate-900 px-4 py-3">Lista de alumnos</th>
                  {components.map(([, label]) => <th key={label} className="min-w-32 px-3 py-3 text-center">{label}</th>)}
                  <th className="min-w-40 px-3 py-3">Conducta</th>
                  <th className="min-w-52 px-3 py-3">Indicadores</th>
                  <th className="min-w-72 px-3 py-3">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.student_id} className={index % 2 ? "bg-slate-50" : "bg-white"}>
                    <td className={`sticky left-0 z-10 border-t border-slate-200 px-4 py-3 font-semibold text-slate-800 ${index % 2 ? "bg-slate-50" : "bg-white"}`}>
                      {row.name}<span className="mt-1 block text-xs font-normal text-slate-400">{row.student_number ?? "Sin legajo"}</span>
                    </td>
                    {components.map(([key, label]) => (
                      <td key={key} className="border-t border-slate-200 px-2 py-3">
                        <label className="sr-only" htmlFor={`${row.student_id}-${key}`}>{label} de {row.name}</label>
                        <select id={`${row.student_id}-${key}`} value={row[key] ?? ""} disabled={!editable} onChange={(event) => updateRow(row.student_id, { [key]: event.target.value === "" ? null : Number(event.target.value) })} className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-2 text-center font-semibold text-slate-800 disabled:bg-slate-100">
                          <option value="">—</option>
                          {Array.from({ length: 10 }, (_, value) => value + 1).map((score) => <option key={score} value={score}>{score}</option>)}
                        </select>
                      </td>
                    ))}
                    <td className="border-t border-slate-200 px-2 py-3">
                      <label className="sr-only" htmlFor={`${row.student_id}-conduct`}>Conducta de {row.name}</label>
                      <select id={`${row.student_id}-conduct`} value={row.conduct ?? ""} disabled={!editable} onChange={(event) => updateRow(row.student_id, { conduct: event.target.value || null })} className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm disabled:bg-slate-100">
                        <option value="">Sin concepto</option><option value="regular">Regular</option><option value="buena">Buena</option><option value="muy_buena">Muy buena</option><option value="excelente">Excelente</option>
                      </select>
                    </td>
                    <td className="border-t border-slate-200 px-3 py-3">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={row.participates_in_class} disabled={!editable} onChange={(event) => updateRow(row.student_id, { participates_in_class: event.target.checked })}/> Participa en clase</label>
                        <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={row.submits_practical_work} disabled={!editable} onChange={(event) => updateRow(row.student_id, { submits_practical_work: event.target.checked })}/> Entrega trabajos prácticos</label>
                        <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={row.demonstrates_interest} disabled={!editable} onChange={(event) => updateRow(row.student_id, { demonstrates_interest: event.target.checked })}/> Demuestra interés</label>
                      </div>
                    </td>
                    <td className="border-t border-slate-200 px-3 py-3">
                      <label className="sr-only" htmlFor={`${row.student_id}-observation`}>Observaciones de {row.name}</label>
                      <textarea id={`${row.student_id}-observation`} rows={3} maxLength={3000} value={row.observation ?? ""} disabled={!editable} onChange={(event) => updateRow(row.student_id, { observation: event.target.value })} placeholder="Indicaciones y seguimiento del alumno…" className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 disabled:bg-slate-100"/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">Mostrando {rows.length} alumnos. Los cambios se guardan al seleccionar «Guardar planilla».</div>
        </div>}
    </section>
  );
}
