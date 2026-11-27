"use client";

import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type AuditRow = {
  student: string;
  action: "created" | "updated" | "cleared";
  old_score: number | null;
  new_score: number | null;
  change_reason: string | null;
  created_at: string;
};

export default function GradeAuditPdf({
  institution, assessment, division, period, events,
}: {
  institution: string;
  assessment: string;
  division: string;
  period: string;
  events: AuditRow[];
}) {
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let page = pdf.addPage([842, 595]);
      let y = 550;
      const ink = rgb(0.12, 0.16, 0.23);
      const draw = (value: string, x: number, size = 9, strong = false) => {
        page.drawText(value.replace(/[\r\n]+/g, " ").slice(0, 115), {
          x, y, size, font: strong ? bold : font, color: ink,
        });
      };
      const nextPage = () => { page = pdf.addPage([842, 595]); y = 550; };
      draw("EDUNEXA | HISTORIAL DE CAMBIOS DE CALIFICACIONES", 40, 15, true); y -= 25;
      draw(institution, 40, 11, true); y -= 18;
      draw(`Evaluación: ${assessment}`, 40, 9); y -= 14;
      draw(`División: ${division} | Período: ${period}`, 40, 9); y -= 14;
      draw(`Registros incluidos: ${events.length} (últimos movimientos disponibles)`, 40, 9); y -= 25;
      draw("Fecha y hora", 40, 8, true);
      draw("Estudiante", 150, 8, true);
      draw("Movimiento", 355, 8, true);
      draw("Antes", 470, 8, true);
      draw("Después", 525, 8, true);
      draw("Motivo", 600, 8, true); y -= 16;
      for (const row of events) {
        if (y < 55) nextPage();
        const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.created_at));
        const action = row.action === "created" ? "Carga inicial" : row.action === "cleared" ? "Nota anulada" : "Nota modificada";
        draw(date, 40, 7.5);
        draw(row.student, 150, 7.5);
        draw(action, 355, 7.5);
        draw(row.old_score === null ? "—" : String(row.old_score), 470, 7.5);
        draw(row.new_score === null ? "—" : String(row.new_score), 525, 7.5);
        draw(row.change_reason || "—", 600, 7.5);
        y -= 17;
      }
      if (!events.length) draw("No hay movimientos de calificaciones para esta evaluación.", 40, 9);
      const bytes = await pdf.save();
      const buffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "edunexa-historial-calificaciones.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={exportPdf} disabled={busy}
      className="mt-3 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60">
      {busy ? "Generando PDF…" : "Descargar historial en PDF"}
    </button>
  );
}
