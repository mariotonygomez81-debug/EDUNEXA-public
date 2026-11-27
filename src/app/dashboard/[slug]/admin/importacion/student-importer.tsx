"use client";
import { useMemo, useState, useTransition } from "react";
import ExcelJS from "exceljs";
import { bulkImportStudents, type StudentImportRow } from "../actions";

type DivisionOption={id:string;academic_year_id:string;name:string;course_name:string;year_name:string};
type Props={slug:string;years:{id:string;name:string;status:string}[];divisions:DivisionOption[]};
type PreviewRow=StudentImportRow&{row:number;errors:string[]};
const headers=["student_number","first_name","last_name","birth_date","email"];
function cellText(value:unknown){if(value===null||value===undefined)return "";if(value instanceof Date)return value.toISOString().slice(0,10);if(typeof value==="object"&&value!==null&&"text" in value)return String((value as {text?:unknown}).text??"");return String(value).trim();}
function normalizeDate(value:unknown){
 if(value instanceof Date)return value.toISOString().slice(0,10);
 const text=cellText(value);if(!text)return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
 const m=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
 if(m)return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
 if(typeof value==="number"){const d=new Date(Math.round((value-25569)*86400*1000));return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);}
 return null;
}
export default function StudentImporter({slug,years,divisions}:Props){
 const [yearId,setYearId]=useState(years.find(y=>y.status==="active")?.id??years[0]?.id??"");
 const [divisionId,setDivisionId]=useState("");
 const [rows,setRows]=useState<PreviewRow[]>([]);
 const [filename,setFilename]=useState("");
 const [message,setMessage]=useState("");
 const [pending,startTransition]=useTransition();
 const options=useMemo(()=>divisions.filter(d=>d.academic_year_id===yearId),[divisions,yearId]);
 const invalid=rows.filter(r=>r.errors.length>0).length;
 const duplicates=rows.length-new Set(rows.map(r=>r.student_number.toLowerCase()).filter(Boolean)).size;
 async function readFile(file:File){
  setMessage("");setRows([]);setFilename(file.name);
  try{
   const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());
   const sheet=workbook.worksheets[0];if(!sheet)throw new Error("El archivo no contiene una hoja.");
   const headerRow=sheet.getRow(1);const index=new Map<string,number>();
   headerRow.eachCell((cell,col)=>index.set(cellText(cell.value).toLowerCase().trim().replaceAll(" ","_"),col));
   const missing=headers.filter(h=>!index.has(h));if(missing.length)throw new Error(`Faltan columnas: ${missing.join(", ")}`);
   const parsed:PreviewRow[]=[];
   for(let r=2;r<=sheet.rowCount;r++){
    const line=sheet.getRow(r);const get=(name:string)=>line.getCell(index.get(name)!).value;
    const number=cellText(get("student_number")),first=cellText(get("first_name")),last=cellText(get("last_name"));
    if(!number&&!first&&!last)continue;
    const birth=normalizeDate(get("birth_date"));const email=cellText(get("email")).toLowerCase()||null;const errors:string[]=[];
    if(number.length<1||number.length>40)errors.push("Legajo obligatorio (máx. 40)");
    if(first.length<2||first.length>100)errors.push("Nombre inválido");
    if(last.length<2||last.length>100)errors.push("Apellido inválido");
    if(cellText(get("birth_date"))&&!birth)errors.push("Fecha inválida");
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push("Correo inválido");
    parsed.push({row:r,student_number:number,first_name:first,last_name:last,birth_date:birth,email,errors});
   }
   if(!parsed.length)throw new Error("No se encontraron alumnos debajo de los encabezados.");
   if(parsed.length>500)throw new Error("El máximo por importación es 500 alumnos.");
   const seen=new Set<string>();for(const row of parsed){const key=row.student_number.toLowerCase();if(key&&seen.has(key))row.errors.push("Legajo repetido en el archivo");if(key)seen.add(key);}
   setRows(parsed);
  }catch(error){setMessage(error instanceof Error?error.message:"No se pudo leer el archivo.");}
 }
 async function downloadTemplate(){
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet("Alumnos");
  ws.addRow(headers);ws.addRow(["2026-001","Ana","Pérez","15/03/2012","familia@example.com"]);
  ws.columns=[{width:20},{width:24},{width:24},{width:18},{width:32}];
  ws.getRow(1).font={bold:true};ws.views=[{state:"frozen",ySplit:1}];
  const bytes=await wb.xlsx.writeBuffer();const blob=new Blob([bytes as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="plantilla_alumnos_edunexa.xlsx";a.click();URL.revokeObjectURL(url);
 }
 function submit(){
  const clean=rows.map(({row,errors,...student})=>student);
  startTransition(()=>bulkImportStudents(slug,yearId,divisionId,clean));
 }
 return <div className="space-y-5">
  <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
   <label className="text-sm font-semibold">Ciclo lectivo<select value={yearId} onChange={e=>{setYearId(e.target.value);setDivisionId("");setRows([]);}} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{years.map(y=><option key={y.id} value={y.id}>{y.name} {y.status==="active"?"· Activo":""}</option>)}</select></label>
   <label className="text-sm font-semibold md:col-span-2">División de destino<select value={divisionId} onChange={e=>setDivisionId(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"><option value="">Seleccionar curso y división</option>{options.map(d=><option key={d.id} value={d.id}>{d.course_name} · {d.name}</option>)}</select></label>
  </section>
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">Archivo de alumnos</h2><p className="text-sm text-slate-500">Excel .xlsx con legajo, nombre, apellido, fecha de nacimiento y correo.</p></div><button type="button" onClick={downloadTemplate} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700">Descargar plantilla</button></div>
   <input type="file" accept=".xlsx" onChange={e=>{const file=e.target.files?.[0];if(file)void readFile(file);}} className="mt-4 block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm"/>
   {filename&&<p className="mt-2 text-xs text-slate-500">Archivo: {filename}</p>}
   {message&&<p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
  </section>
  {rows.length>0&&<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Vista previa de importación</h2><p className="text-sm text-slate-500">{rows.length} filas · {invalid} con observaciones · {duplicates} legajos duplicados</p></div><button type="button" disabled={!divisionId||invalid>0||duplicates>0||pending} onClick={submit} className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{pending?"Procesando…":`Matricular ${rows.length} alumnos`}</button></div>
   <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Fila</th><th className="p-3">Legajo</th><th className="p-3">Apellido y nombre</th><th className="p-3">Nacimiento</th><th className="p-3">Correo</th><th className="p-3">Estado</th></tr></thead><tbody>{rows.slice(0,100).map(r=><tr key={r.row} className="border-t border-slate-100"><td className="p-3">{r.row}</td><td className="p-3">{r.student_number}</td><td className="p-3">{r.last_name}, {r.first_name}</td><td className="p-3">{r.birth_date??"—"}</td><td className="p-3">{r.email??"—"}</td><td className="p-3">{r.errors.length?<span className="text-rose-700">{r.errors.join("; ")}</span>:<span className="text-emerald-700">Listo</span>}</td></tr>)}</tbody></table></div>
   {rows.length>100&&<p className="mt-2 text-xs text-slate-500">Se muestran las primeras 100 filas; se procesarán las {rows.length} filas si todas son válidas.</p>}
   <p className="mt-4 rounded-lg bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">La importación se realiza en una única transacción. Si un legajo ya existe, la división no corresponde al ciclo seleccionado o falla una matriculación, no se confirma parcialmente el lote.</p>
  </section>}
 </div>;
}
