"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type ReportRow = {
  date: string;
  kind: string;
  categoryKey: string;
  division: string;
  student: string;
  title: string;
  status: string;
  detail: string;
  extra: string;
};

export default function PrefectFollowupPdf({ institution, filters, rows }: {
  institution: string;
  filters: string[];
  rows: ReportRow[];
}) {
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const ink = rgb(0.12, 0.16, 0.23);
      const muted = rgb(0.36, 0.4, 0.47);
      const rule = rgb(0.85, 0.87, 0.9);
      let page = pdf.addPage([595, 842]);
      let y = 795;
      const clean = (value: string) => value
        .replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"').replace(/\u2022/g, "-")
        .replace(/[\r\n]+/g, " ").trim();
      const addPage = () => { page = pdf.addPage([595, 842]); y = 795; };
      const draw = (value: string, size = 9, strong = false, color = ink, x = 42) => {
        const safe = clean(value);
        if (!safe) return;
        page.drawText(safe.slice(0, 180), { x, y, size, font: strong ? bold : font, color });
      };
      const wrap = (value: string, size: number, width = 510) => {
        const words = clean(value).split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const candidate = current ? current + " " + word : word;
          if (font.widthOfTextAtSize(candidate, size) > width && current) {
            lines.push(current); current = word;
          } else current = candidate;
        }
        if (current) lines.push(current);
        return lines;
      };
      const paragraph = (label: string, value: string, size = 8.5) => {
        if (!value?.trim()) return;
        if (y < 70) addPage();
        draw(label, 8, true, muted); y -= 12;
        for (const line of wrap(value, size)) {
          if (y < 48) addPage();
          draw(line, size); y -= 11;
        }
        y -= 5;
      };
      const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.categoryKey.localeCompare(b.categoryKey));
      draw("EDUNEXA | INFORME DE SEGUIMIENTO DE PRECEPTORIA", 13, true); y -= 22;
      draw(institution, 10, true); y -= 17;
      draw(`Fecha de emision: ${new Date().toLocaleDateString("es-AR")}`, 8, false, muted); y -= 18;
      page.drawLine({ start: { x: 42, y }, end: { x: 553, y }, thickness: 1, color: rule }); y -= 18;
      draw("FILTROS APLICADOS", 9, true); y -= 14;
      for (const filter of filters) { draw(filter, 8, false, muted); y -= 11; }
      y -= 8;
      draw(`REGISTROS INCLUIDOS: ${sorted.length}`, 9, true); y -= 18;

      let previousDate = "";
      let previousCategory = "";
      for (const row of sorted) {
        const date = new Date(row.date.length === 10 ? row.date + "T12:00:00-03:00" : row.date);
        const dateText = new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "America/Argentina/Buenos_Aires" }).format(date);
        if (dateText !== previousDate) {
          if (y < 110) addPage();
          y -= 5;
          page.drawLine({ start: { x: 42, y }, end: { x: 553, y }, thickness: 0.8, color: rule }); y -= 16;
          draw(dateText.toLocaleUpperCase("es-AR"), 9, true); y -= 17;
          previousDate = dateText;
          previousCategory = "";
        }
        if (row.kind !== previousCategory) {
          if (y < 85) addPage();
          draw(row.kind.toLocaleUpperCase("es-AR"), 8, true, rgb(0.35, 0.25, 0.58)); y -= 13;
          previousCategory = row.kind;
        }
        if (y < 95) addPage();
        draw(row.title, 9, true); y -= 13;
        paragraph("INSTITUCION / DIVISION / ALUMNO", `${institution} | ${row.division} | ${row.student}`, 8);
        paragraph("ESTADO", row.status, 8);
        paragraph("DETALLE", row.detail, 8.5);
        paragraph("SEGUIMIENTO / INFORMACION ADICIONAL", row.extra, 8);
        y -= 4;
      }
      if (!sorted.length) draw("No hay registros para los filtros seleccionados.", 9, false, muted);
      const bytes = await pdf.save();
      const buffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "edunexa-informe-seguimiento-preceptoria.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return <button type="button" onClick={exportPdf} disabled={busy}
    className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
    <Download size={16} />{busy ? "Generando PDF..." : "Descargar informe PDF"}
  </button>;
}
