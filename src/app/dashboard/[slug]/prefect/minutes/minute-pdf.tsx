"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Snapshot = {
  category?: string; title?: string; description?: string; event_date?: string;
  status?: string; follow_up?: string | null; follow_up_due_on?: string | null;
};

export default function PrefectMinutePdf({institution,division,student,minute}:{
  institution:string; division:string; student:string;
  minute:{folio:number;date:string;type:string;subject:string;participants:string;development:string;agreements:string;source:Snapshot};
}) {
  const [busy,setBusy]=useState(false);
  async function download() {
    setBusy(true);
    try {
      const pdf=await PDFDocument.create();
      const font=await pdf.embedFont(StandardFonts.Helvetica);
      const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
      const ink=rgb(0.12,0.16,0.23), muted=rgb(0.36,0.4,0.47), lineColor=rgb(0.85,0.87,0.9);
      let page=pdf.addPage([595,842]); let y=790;
      const clean=(value:string)=>value.replace(/[\u2013\u2014]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[\r\n]+/g," ").trim();
      const addPage=()=>{page=pdf.addPage([595,842]);y=790;};
      const draw=(value:string,size=9,strong=false,color=ink)=>page.drawText(clean(value).slice(0,180),{x:48,y,size,font:strong?bold:font,color});
      const wrapped=(value:string,size=9,width=495)=>{
        const words=clean(value).split(/\s+/).filter(Boolean);const lines:string[]=[];let current="";
        for(const word of words){const next=current?current+" "+word:word;if(font.widthOfTextAtSize(next,size)>width&&current){lines.push(current);current=word;}else current=next;}
        if(current)lines.push(current);return lines;
      };
      const paragraph=(label:string,value:string)=>{
        if(!value.trim())return;
        draw(label,9,true);y-=15;
        for(const line of wrapped(value,9)){if(y<55)addPage();draw(line,9);y-=13;}
        y-=8;
      };
      draw("EDUNEXA | ACTA DE PRECEPTORIA",15,true);y-=24;
      draw(institution,11,true);y-=18;
      page.drawLine({start:{x:48,y},end:{x:547,y},thickness:1,color:lineColor});y-=24;
      draw(`ACTA N.º ${String(minute.folio).padStart(6,"0")}`,11,true);y-=18;
      draw(`Fecha: ${new Date(minute.date+"T12:00:00").toLocaleDateString("es-AR")}   Tipo: ${minute.type}`,9,false,muted);y-=17;
      draw(`División: ${division}`,9,true);y-=15;
      if(student){draw(`Alumno/a: ${student}`,9);y-=15;}
      paragraph("ASUNTO",minute.subject);
      paragraph("PARTICIPANTES",minute.participants);
      if(minute.source&&Object.keys(minute.source).length){
        paragraph("ANTECEDENTE VINCULADO - NOVEDAD",`${minute.source.event_date??""} | ${minute.source.category??""} | ${minute.source.title??""}\n${minute.source.description??""}\nEstado: ${minute.source.status??""}\nSeguimiento: ${minute.source.follow_up??"Sin seguimiento registrado"}\nPróxima acción: ${minute.source.follow_up_due_on??"Sin fecha"}`);
      }
      paragraph("DESARROLLO Y CONSTANCIA",minute.development);
      paragraph("ACUERDOS Y COMPROMISOS",minute.agreements);
      if(y<105)addPage();
      y-=12;page.drawLine({start:{x:48,y},end:{x:547,y},thickness:0.8,color:lineColor});y-=48;
      page.drawLine({start:{x:70,y},end:{x:245,y},thickness:0.7,color:muted});
      page.drawLine({start:{x:350,y},end:{x:525,y},thickness:0.7,color:muted});
      draw("Firma y aclaración",8,false,muted);page.drawText("Firma y aclaración",{x:390,y:y-15,size:8,font,color:muted});
      const bytes=await pdf.save();const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer],{type:"application/pdf"}));
      const link=document.createElement("a");link.href=url;link.download=`edunexa-acta-${String(minute.folio).padStart(6,"0")}.pdf`;link.click();URL.revokeObjectURL(url);
    } finally {setBusy(false);}
  }
  return <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"><Download size={15}/>{busy?"Preparando PDF…":"Descargar acta PDF"}</button>;
}
