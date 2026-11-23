"use client";

import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type NoveltyRow = {
  date: string;
  division: string;
  student: string;
  category: string;
  title: string;
  description: string;
  status: string;
  followUp: string;
};

export default function PrefectNoveltiesPdf({
  institution, rows,
}: {
  institution: string;
  rows: NoveltyRow[];
}) {
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const ink = rgb(0.12, 0.16, 0.23);
      const muted = rgb(0.35, 0.39, 0.46);
      let page = pdf.addPage([595, 842]);
      let y = 800;
      const draw = (text: string, x: number, size = 9, strong = false, color = ink) => {
        page.drawText(text.replace(/[\r\n]+/g, " ").slice(0, 150), {
          x, y, size, font: strong ? bold : font, color,
        });
      };
      const ensureSpace = (needed: number) => {
        if (y - needed < 45) {
          page = pdf.addPage([595, 842]);
          y = 800;
        }
      };
      const wrap = (text: string, maxWidth: number, size: number) => {
        const words = text.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const candidate = line ? line + " " + word : word;
          if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
            lines.push(line);
            line = word;
          } else line = candidate;
        }
        if (line) lines.push(line);
        return lines;
      };
      draw("EDUNEXA | INFORME DE NOVEDADES Y CONVIVENCIA", 40, 14, true); y -= 23;
      draw(institution, 40, 10, true); y -= 16;
      draw(`Registros incluidos: ${rows.length} · Datos de las divisiones asignadas`, 40, 8.5, false, muted); y -= 25;

      for (const row of rows) {
        const bodyLines = wrap(row.description, 510, 8.5);
        const followLines = row.followUp ? wrap(`Seguimiento: ${row.followUp}`, 510, 8) : [];
        const blockHeight = 64 + bodyLines.length * 11 + followLines.length * 10;
        ensureSpace(blockHeight);
        draw(`${row.date} · ${row.category} · ${row.status}`, 40, 8, true, muted); y -= 13;
        draw(row.title, 40, 10, true); y -= 14;
        draw(`División: ${row.division} | Alumno: ${row.student}`, 40, 8); y -= 13;
        for (const line of bodyLines) { draw(line, 40, 8.5); y -= 11; }
        for (const line of followLines) { draw(line, 40, 8, false, muted); y -= 10; }
        y -= 12;
        page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.86, 0.88, 0.91) });
        y -= 14;
      }
      if (!rows.length) draw("No hay novedades registradas para las divisiones asignadas.", 40, 9);
      const bytes = await pdf.save();
      const buffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "edunexa-informe-novedades-convivencia.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={exportPdf} disabled={busy}
      className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
      {busy ? "Generando PDF…" : "Descargar informe PDF"}
    </button>
  );
}
