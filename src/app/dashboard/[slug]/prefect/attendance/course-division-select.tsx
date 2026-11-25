"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

type Course={id:string;name:string};
type Division={id:string;name:string;course_id:string};
export default function CourseDivisionSelect({slug,courses,divisions,selectedCourseId,selectedDivisionId}:{
 slug:string;courses:Course[];divisions:Division[];selectedCourseId:string;selectedDivisionId:string;
}) {
 const router=useRouter();
 const available=useMemo(()=>divisions.filter(d=>d.course_id===selectedCourseId),[divisions,selectedCourseId]);
 const selectCourse=(id:string)=>router.push(id?`/dashboard/${slug}/prefect/attendance?courseId=${id}`:`/dashboard/${slug}/prefect/attendance`);
 const selectDivision=(id:string)=>router.push(id?`/dashboard/${slug}/prefect/attendance?courseId=${selectedCourseId}&divisionId=${id}`:`/dashboard/${slug}/prefect/attendance?courseId=${selectedCourseId}`);
 return <div className="grid gap-4 sm:grid-cols-2">
  <label className="block text-sm font-semibold text-slate-700">Curso
   <select value={selectedCourseId} onChange={e=>selectCourse(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm">
    <option value="">Seleccionar curso</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
   </select>
  </label>
  <label className="block text-sm font-semibold text-slate-700">División
   <select value={selectedDivisionId} disabled={!selectedCourseId} onChange={e=>selectDivision(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm disabled:bg-slate-100">
    <option value="">Seleccionar división</option>{available.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
   </select>
  </label>
 </div>;
}
