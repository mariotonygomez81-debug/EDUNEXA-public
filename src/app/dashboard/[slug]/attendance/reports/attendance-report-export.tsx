"use client";

import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Row = {
  first_name: string;
  last_name: string;
  student_number: string | null;
  total: number;
  rate: number | null;
  counts: { present: number; absent: number; late: number; justified: number; early_departure: number };
};

export default function AttendanceReportExport({
  institution, from, to, totals, rows,
}: {
  institution: string;
  from: string;
  to: string;
  totals: { present: number; absent: number; late: number; justified: number; early_departure: number };
  rows: Row[];
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
      const draw = (text: string, x: number, size = 9, isBold = false) => {
        page.drawText(text.slice(0, 110), { x, y, size, font: isBold ? bold : font, color: rgb(0.12, 0.16, 0.23) });
      };
      draw("EDUNEXA | INFORME DE ASISTENCIA", 40, 16, true); y -= 24;
      draw(institution, 40, 11, true); y -= 16;
      draw(`Período: ${from} al ${to} | Estudiantes: ${rows.length}`, 40); y -= 24;
      draw(`Presentes: ${totals.present}   Ausentes: ${totals.absent}   Tardanzas: ${totals.late}   Justificadas: ${totals.justified}   Retiros: ${totals.early_departure}`, 40, 9, true); y -= 25;
      const headers = ["Estudiante", "Matrícula", "Reg.", "Pres.", "Aus.", "Tarde", "Just.", "Retiro", "%"];
      const xs = [40, 250, 350, 390, 435, 480, 530, 585, 650];
      headers.forEach((h, i) => draw(h, xs[i], 8, true)); y -= 14;
      for (const row of rows) {
        if (y < 45) { page = pdf.addPage([842, 595]); y = 550; }
        const values = [
          `${row.last_name}, ${row.first_name}`, row.student_number || "—", String(row.total),
          String(row.counts.present), String(row.counts.absent), String(row.counts.late),
          String(row.counts.justified), String(row.counts.early_departure),
          row.rate === null ? "—" : `${row.rate}%`,
        ];
        values.forEach((value, i) => draw(value, xs[i], 8)); y -= 14;
      }
      const bytes = await pdf.save();
      const pdfBuffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([pdfBuffer], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url; link.download = `edunexa-asistencia-${from}-${to}.pdf`;
      link.click(); URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  }
  return <button type="button" onClick={exportPdf} disabled={busy}
    className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
    {busy ? "Generando PDF…" : "Descargar informe PDF"}
  </button>;
}
