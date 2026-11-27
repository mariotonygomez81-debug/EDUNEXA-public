"use client";

import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Download, FileCheck2, LoaderCircle } from "lucide-react";

type Props = {
  institutionName: string;
  classroomTitle: string;
  courseName: string;
  divisionName: string;
  subjectName: string;
  teacherNames: string[];
  joinCode: string;
  schoolSlug: string;
};

const hex = (value: string) => {
  const normalized = value.replace("#", "");
  return rgb(
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  );
};

export default function ClassroomPdfButton(props: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function generatePdf() {
    if (loading || !props.joinCode) return;
    setLoading(true);
    setMessage("");
    try {
      const destination = `${window.location.origin}/join/classroom?school=${encodeURIComponent(props.schoolSlug)}`;
      const qrEndpoint = `https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=2&ecc=H&format=png&data=${encodeURIComponent(destination)}`;
      const qrResponse = await fetch(qrEndpoint);
      if (!qrResponse.ok) throw new Error("No se pudo generar el código QR.");
      const qrBytes = await qrResponse.arrayBuffer();

      const pdf = await PDFDocument.create();
      pdf.setTitle(`Acceso al aula - ${props.classroomTitle}`);
      pdf.setAuthor("EDUNEXA");
      pdf.setSubject("Código y QR de acceso al aula virtual");
      const page = pdf.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const qr = await pdf.embedPng(qrBytes);

      const navy = hex("#101D3A");
      const blue = hex("#244A9A");
      const cyan = hex("#32C5D8");
      const ink = hex("#17233F");
      const muted = hex("#65718A");
      const pale = hex("#F2F6FC");
      const line = hex("#DCE5F1");
      const white = rgb(1, 1, 1);

      page.drawRectangle({ x: 0, y: height - 222, width, height: 222, color: navy });
      page.drawRectangle({ x: 0, y: height - 222, width: 9, height: 222, color: cyan });
      page.drawCircle({ x: width - 38, y: height - 30, size: 126, borderColor: rgb(0.35, 0.55, 0.9), borderWidth: 1.2, opacity: 0.24 });
      page.drawCircle({ x: width - 38, y: height - 30, size: 91, borderColor: cyan, borderWidth: 1, opacity: 0.18 });
      page.drawText("EDUNEXA", { x: 48, y: 785, size: 17, font: bold, color: white });
      page.drawRectangle({ x: 48, y: 769, width: 37, height: 3, color: cyan });
      page.drawText("AULA VIRTUAL", { x: 48, y: 711, size: 29, font: bold, color: white });
      page.drawText("TU ESPACIO PARA APRENDER Y CONECTAR", { x: 50, y: 686, size: 9, font: bold, color: hex("#BFD4F5") });
      page.drawText(props.institutionName.slice(0, 58), { x: 48, y: 644, size: 15, font: bold, color: white, maxWidth: 480 });
      // Keep the section label inside the white access card for clear contrast.
      page.drawText("ACCESO A CLASE", { x: 58, y: 552, size: 9, font: bold, color: blue });

      page.drawRectangle({ x: 34, y: 348, width: 527, height: 222, color: white, borderColor: line, borderWidth: 1 });
      page.drawText("CÓDIGO DE LA CLASE", { x: 58, y: 530, size: 10, font: bold, color: muted });
      page.drawText(props.joinCode, { x: 56, y: 475, size: Math.min(34, 300 / Math.max(props.joinCode.length, 5)), font: bold, color: blue });
      page.drawRectangle({ x: 58, y: 449, width: 205, height: 2, color: cyan });
      page.drawText("Ingresá este código en EDUNEXA", { x: 58, y: 425, size: 10, font: regular, color: muted });
      page.drawText("Luego ingresá el código impreso.", { x: 58, y: 410, size: 10, font: regular, color: muted });

      page.drawRectangle({ x: 354, y: 370, width: 184, height: 180, color: pale });
      page.drawImage(qr, { x: 373, y: 393, width: 146, height: 146 });
      const qrCaption = "ESCANEÁ Y ESCRIBÍ EL CÓDIGO";
      const qrCaptionWidth = bold.widthOfTextAtSize(qrCaption, 8);
      page.drawText(qrCaption, { x: 446 - qrCaptionWidth / 2, y: 378, size: 8, font: bold, color: blue });

      page.drawText("DATOS DE LA CLASE", { x: 48, y: 310, size: 10, font: bold, color: blue });
      const info = [
        { label: "MATERIA", value: props.subjectName },
        { label: "CURSO Y DIVISIÓN", value: `${props.courseName} · ${props.divisionName}` },
        { label: "AULA", value: props.classroomTitle },
        { label: "DOCENTE", value: props.teacherNames.join(", ") || "Equipo docente" },
      ];
      const positions = [
        { x: 48, y: 240, w: 239 },
        { x: 308, y: 240, w: 239 },
        { x: 48, y: 158, w: 239 },
        { x: 308, y: 158, w: 239 },
      ];
      info.forEach((item, index) => {
        const pos = positions[index];
        page.drawRectangle({ x: pos.x, y: pos.y, width: pos.w, height: 65, color: pale });
        page.drawText(item.label, { x: pos.x + 13, y: pos.y + 43, size: 8, font: bold, color: muted });
        page.drawText((item.value || "No especificado").slice(0, 42), { x: pos.x + 13, y: pos.y + 19, size: 11, font: bold, color: ink, maxWidth: pos.w - 24 });
      });

      page.drawRectangle({ x: 0, y: 0, width, height: 91, color: navy });
      page.drawRectangle({ x: 0, y: 89, width, height: 2, color: cyan });
      page.drawText("LISTO PARA COMPARTIR", { x: 48, y: 59, size: 10, font: bold, color: white });
      page.drawText("Imprimí esta hoja y compartila con tus estudiantes.", { x: 48, y: 38, size: 9, font: regular, color: hex("#C6D5EE") });
      page.drawText("EDUNEXA  /  APRENDER. GESTIONAR. CONECTAR.", { x: 48, y: 17, size: 7, font: bold, color: cyan });

      const bytes = await pdf.save();
      const safeBytes = new Uint8Array(bytes.length);
      safeBytes.set(bytes);
      const blob = new Blob([safeBytes.buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `EDUNEXA-acceso-${props.classroomTitle.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "aula"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("PDF generado y descargado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar el PDF.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={generatePdf} disabled={loading || !props.joinCode}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60">
        {loading ? <LoaderCircle size={16} className="animate-spin"/> : message.startsWith("PDF") ? <FileCheck2 size={16}/> : <Download size={16}/>}
        {loading ? "Generando PDF…" : "Descargar PDF con QR"}
      </button>
      {message ? <p role="status" aria-live="polite" className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
