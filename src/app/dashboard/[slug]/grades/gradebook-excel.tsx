"use client";

import { useState } from "react";
import ExcelJS from "exceljs";
import { FileSpreadsheet } from "lucide-react";

type GradebookRow = {
  studentName: string;
  studentNumber: string | null;
  score: number | null;
  comment: string | null;
  periodResult: number | null;
};

export default function GradebookExcel({
  institution, assessment, division, subject, period, assessmentDate, maxScore, weightPercent, rows,
}: {
  institution: string;
  assessment: string;
  division: string;
  subject: string;
  period: string;
  assessmentDate: string | null;
  maxScore: number;
  weightPercent: number | null;
  rows: GradebookRow[];
}) {
  const [busy, setBusy] = useState(false);

  async function exportWorkbook() {
    setBusy(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "EDUNEXA";
      workbook.subject = "Planilla de calificaciones";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("Calificaciones");
      sheet.columns = [
        { header: "Alumno", key: "student", width: 34 },
        { header: "Matrícula", key: "enrollment", width: 18 },
        { header: "Nota", key: "score", width: 14 },
        { header: "Puntaje máximo", key: "maximum", width: 18 },
        { header: "Resultado evaluación (%)", key: "percentage", width: 25 },
        { header: "Resultado del período (%)", key: "period", width: 27 },
        { header: "Observación", key: "comment", width: 48 },
      ];
      sheet.mergeCells("A1:G1");
      sheet.getCell("A1").value = "EDUNEXA · PLANILLA DE CALIFICACIONES";
      sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF312E81" } };
      sheet.mergeCells("A2:G2");
      sheet.getCell("A2").value = institution;
      sheet.getCell("A2").font = { bold: true, size: 12 };
      sheet.mergeCells("A3:G3");
      sheet.getCell("A3").value = `Evaluación: ${assessment} · ${division} · ${subject}`;
      sheet.mergeCells("A4:G4");
      sheet.getCell("A4").value = `Período: ${period} · Fecha: ${assessmentDate ?? "Sin fecha"} · Máximo: ${maxScore} · Ponderación: ${weightPercent === null ? "Sin ponderar" : `${weightPercent}%`}`;
      sheet.getRow(6).values = ["Alumno", "Matrícula", "Nota", "Puntaje máximo", "Resultado evaluación (%)", "Resultado del período (%)", "Observación"];
      const header = sheet.getRow(6);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
      header.alignment = { vertical: "middle", wrapText: true };
      for (const row of rows) {
        const excelRow = sheet.addRow({
          student: row.studentName,
          enrollment: row.studentNumber ?? "",
          score: row.score,
          maximum: maxScore,
          percentage: row.score === null ? null : Number(((row.score / maxScore) * 100).toFixed(2)),
          period: row.periodResult === null ? null : Number(row.periodResult.toFixed(2)),
          comment: row.comment ?? "",
        });
        excelRow.getCell(3).numFmt = "0.00";
        excelRow.getCell(5).numFmt = '0.00"%"';
        excelRow.getCell(6).numFmt = '0.00"%"';
        excelRow.alignment = { vertical: "top", wrapText: true };
      }
      sheet.autoFilter = { from: "A6", to: "G6" };
      sheet.views = [{ state: "frozen", ySplit: 6 }];
      sheet.getRow(6).height = 32;
      const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = `edunexa-calificaciones-${assessment}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
      link.href = url;
      link.download = `${safeName || "evaluacion"}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={exportWorkbook} disabled={busy || rows.length === 0}
      className="inline-flex items-center gap-2 rounded-md border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60">
      <FileSpreadsheet size={15} /> {busy ? "Generando Excel…" : "Exportar planilla"}
    </button>
  );
}
