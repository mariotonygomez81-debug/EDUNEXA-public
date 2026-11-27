"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { finishAcademicYearBackupRestore,prepareAcademicYearBackupStorageRestore } from "../actions";
type Year={id:string;name:string;status:string};
type StorageFile={bucket_id:string;object_path:string;original_filename:string;mime_type:string;byte_size:number;content_base64:string;source_table:string;id:string};
type PackageData={format:string;schema_version:number;institution_id:string;academic_year_id:string;tables:Record<string,unknown>;storage_files:StorageFile[];storage_payload_included?:boolean};
export default function BackupRestorer({slug,years,selectedYearId}:{slug:string;years:Year[];selectedYearId:string}){
 const [yearId,setYearId]=useState(selectedYearId||years[0]?.id||"");const [file,setFile]=useState<File|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 async function restore(){
  if(!file||!yearId||busy)return;setBusy(true);setMessage("Leyendo paquete EDUNEXA…");
  try{
   if(file.size>140*1024*1024)throw new Error("El paquete supera el límite de 140 MB.");
   const parsed=JSON.parse(await file.text()) as PackageData;
   if(parsed.format!=="EDUNEXA_ACADEMIC_BACKUP"||parsed.schema_version!==1||!parsed.institution_id||parsed.academic_year_id!==yearId||!parsed.tables||!Array.isArray(parsed.storage_files))throw new Error("El formato, la versión o el ciclo lectivo no coinciden.");
   if(parsed.storage_files.length>10000)throw new Error("El manifiesto contiene demasiados archivos.");
   let total=0;
   const manifest=parsed.storage_files.map(({content_base64,...meta})=>{total+=Number(meta.byte_size);if(!content_base64||!Number.isSafeInteger(meta.byte_size)||meta.byte_size<1||meta.byte_size>10*1024*1024)throw new Error("Un adjunto no contiene datos válidos.");return meta;});
   if(total>100*1024*1024)throw new Error("Los adjuntos superan el límite total de 100 MB.");
   const cleanSnapshot={...parsed,storage_files:manifest,storage_payload_included:true};
   setMessage("Solicitando autorización temporal para los adjuntos…");
   const prepared=await prepareAcademicYearBackupStorageRestore(slug,yearId,cleanSnapshot);
   if(!prepared.ok)throw new Error(prepared.message);
   const supabase=createClient();
   for(let index=0;index<parsed.storage_files.length;index++){
    const item=parsed.storage_files[index];setMessage("Restaurando adjunto "+(index+1)+" de "+parsed.storage_files.length+"…");
    const binary=atob(item.content_base64);if(binary.length!==item.byte_size)throw new Error("El tamaño no coincide: "+item.original_filename);
    const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const {error:uploadError}=await supabase.storage.from(item.bucket_id).upload(item.object_path,bytes,{contentType:item.mime_type,upsert:false});
    if(uploadError){
     const {data:existing,error:readError}=await supabase.storage.from(item.bucket_id).download(item.object_path);
     if(readError||!existing)throw new Error("No se pudo restaurar "+item.original_filename+". "+uploadError.message);
    }
   }
   setMessage("Incorporando los datos académicos y sus relaciones…");
   const result=await finishAcademicYearBackupRestore(slug,yearId,{...cleanSnapshot,storage_files:manifest});
   if(!result.ok)throw new Error(result.message);
   setMessage("Restauración completada: "+result.files+" adjuntos reconocidos por EDUNEXA.");
   setFile(null);
  }catch(error){setMessage(error instanceof Error?error.message:"No se pudo restaurar el paquete.");}
  finally{setBusy(false);}
 }
 return <div className="mt-4 space-y-3">
  <label className="block text-sm font-medium">Ciclo lectivo de destino<select value={yearId} onChange={e=>setYearId(e.target.value)} required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2">{years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
  <label className="block text-sm font-medium">Paquete JSON EDUNEXA<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setMessage("");}} className="mt-1 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm"/></label>
  <button type="button" disabled={!file||!yearId||busy||!years.length} onClick={()=>void restore()} className="rounded-xl bg-amber-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?"Restaurando…":"Reconocer y restaurar paquete"}</button>
  {message&&<p role="status" aria-live="polite" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
 </div>;
}
