"use client";

import { useState } from "react";
import { createGradingScale } from "./actions";

type Level = {
  id: number;
  minimum: string;
  maximum: string;
  label: string;
  gradeValue: string;
  passing: boolean;
};

const DEFAULT_LEVELS: Level[] = [
  { id: 1, minimum: "0", maximum: "49.99", label: "Insuficiente", gradeValue: "1", passing: false },
  { id: 2, minimum: "50", maximum: "59.99", label: "En proceso", gradeValue: "4", passing: false },
  { id: 3, minimum: "60", maximum: "69.99", label: "Suficiente", gradeValue: "6", passing: true },
  { id: 4, minimum: "70", maximum: "89.99", label: "Bueno", gradeValue: "8", passing: true },
  { id: 5, minimum: "90", maximum: "100", label: "Excelente", gradeValue: "10", passing: true },
];

export default function GradingScaleCreateForm({ slug }: { slug: string }) {
  const [levels, setLevels] = useState<Level[]>(DEFAULT_LEVELS);
  const [displayMode, setDisplayMode] = useState("both");

  function updateLevel(id: number, patch: Partial<Level>) {
    setLevels((current) => current.map((level) => level.id === id ? { ...level, ...patch } : level));
  }

  function addLevel() {
    if (levels.length >= 20) return;
    const last = levels[levels.length - 1];
    const minimum = Number(last.minimum);
    const maximum = Number(last.maximum);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum - minimum < 0.02) return;
    const split = Math.round(((minimum + maximum) / 2) * 100) / 100;
    const previousMaximum = Math.round((split - 0.01) * 100) / 100;
    if (split <= minimum || previousMaximum < minimum) return;
    const nextId = Math.max(...levels.map((level) => level.id)) + 1;
    setLevels((current) => [
      ...current.slice(0, -1),
      { ...last, maximum: previousMaximum.toFixed(2) },
      { ...last, id: nextId, minimum: split.toFixed(2), maximum: maximum.toFixed(2), label: "Nuevo nivel" },
    ]);
  }

  function removeLevel(id: number) {
    if (levels.length <= 2) return;
    setLevels((current) => current.filter((level) => level.id !== id));
  }

  return (
    <form action={createGradingScale} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="level_count" value={levels.length} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Nombre de la escala
          <input name="name" required minLength={2} maxLength={80} placeholder="Escala numérica 1 a 10" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Forma de mostrar la nota
          <select name="display_mode" value={displayMode} onChange={(event) => setDisplayMode(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="numeric">Numérica</option>
            <option value="descriptive">Descriptiva</option>
            <option value="both">Numérica y descriptiva</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Descripción
          <input name="description" maxLength={500} placeholder="Descripción opcional de uso institucional" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Nota mínima
          <input name="minimum_value" type="number" step="0.01" defaultValue="1" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Nota máxima
          <input name="maximum_value" type="number" step="0.01" defaultValue="10" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Nota mínima para aprobar
          <input name="passing_value" type="number" step="0.01" defaultValue="6" disabled={displayMode === "descriptive"} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal disabled:bg-slate-100" />
        </label>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Niveles de la escala</h3>
            <p className="text-xs text-slate-500">Los rangos porcentuales deben cubrir del 0 al 100, sin superponerse ni dejar intervalos vacíos.</p>
          </div>
          <button type="button" onClick={addLevel} disabled={levels.length >= 20} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            Agregar nivel
          </button>
        </div>
        <div className="space-y-3">
          {levels.map((level, index) => (
            <div key={level.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1.5fr_1fr_auto]">
              <label className="text-xs font-medium text-slate-600">
                Desde %
                <input name="level_minimum_percentage" type="number" min="0" max="100" step="0.01" required value={level.minimum} onChange={(event) => updateLevel(level.id, { minimum: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Hasta %
                <input name="level_maximum_percentage" type="number" min="0" max="100" step="0.01" required value={level.maximum} onChange={(event) => updateLevel(level.id, { maximum: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Descriptor
                <input name="level_label" maxLength={80} required value={level.label} onChange={(event) => updateLevel(level.id, { label: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Nota
                <input name="level_grade_value" type="number" step="0.01" value={level.gradeValue} placeholder="Opcional" onChange={(event) => updateLevel(level.id, { gradeValue: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal disabled:bg-slate-100" />
              </label>
              <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-center sm:justify-end">
                <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
                  <input type="checkbox" name={`level_is_passing_${index}`} value="true" checked={level.passing} onChange={(event) => updateLevel(level.id, { passing: event.target.checked })} />
                  Aprueba
                </label>
                <button type="button" onClick={() => removeLevel(level.id)} disabled={levels.length <= 2} aria-label={`Quitar nivel ${level.label}`} className="pb-2 text-xs font-semibold text-rose-700 hover:underline disabled:opacity-30">
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button type="submit" className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
        Crear escala
      </button>
    </form>
  );
}
