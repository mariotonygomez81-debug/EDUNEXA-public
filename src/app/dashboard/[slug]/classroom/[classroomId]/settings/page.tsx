import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Palette, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { updateTeacherOwnedClassroom, updateTeacherClassroomPreferences } from "./actions";
import AjaxForm from "../ajax-form";

type Overview = { id:string; title:string; description:string|null; course_name:string; division_name:string; subject_name:string|null };
type Preferences = { accent_theme:"indigo"|"ocean"|"emerald"|"sunset"|"violet"; layout_density:"comfortable"|"compact"; default_section:"news"|"work"|"people"|"attendance"|"grades"; show_header_stats:boolean };

export default async function ClassroomSettingsPage({params}:{params:Promise<{slug:string;classroomId:string}>}) {
  const {slug,classroomId}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id").eq("slug",slug).maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const {data:capabilities}=await supabase.rpc("get_classroom_capabilities",{p_classroom_id:classroomId});
  const caps=(capabilities??{}) as {can_read?:boolean;can_manage_members?:boolean;can_grade?:boolean;can_attendance?:boolean;can_view_attendance?:boolean};
  if(!caps.can_read) notFound();
  if(!caps.can_manage_members) redirect(`/dashboard/${slug}/classroom/${classroomId}`);
  const [{data,error},{data:preferenceData}]=await Promise.all([
    supabase.rpc("get_classroom_overview",{p_classroom_id:classroomId}),
    supabase.rpc("get_teacher_classroom_preferences",{p_classroom_id:classroomId}),
  ]);
  if(error||!data) notFound();
  const classroom=data as unknown as Overview;
  const preferences=(preferenceData??{accent_theme:"indigo",layout_density:"comfortable",default_section:"news",show_header_stats:true}) as Preferences;
  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-7 text-slate-800 sm:px-7 lg:px-10"><div className="mx-auto max-w-4xl space-y-6">
    <Link href={`/dashboard/${slug}/classroom/${classroomId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-700"><ArrowLeft size={16}/> Volver al aula</Link>
    <header className="rounded-[28px] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-xl sm:p-9"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wider text-indigo-100"><SlidersHorizontal size={14}/> PERSONALIZACIÓN DOCENTE</span><h1 className="mt-4 text-3xl font-bold">Configuración del aula</h1><p className="mt-2 text-sm text-indigo-100">Personalizá la presentación y el comportamiento de este espacio. Tus preferencias son individuales y no modifican la vista de otros docentes.</p></header>
    <AjaxForm action={updateTeacherOwnedClassroom} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div><h2 className="text-lg font-bold text-slate-900">Datos generales</h2><p className="mt-1 text-sm text-slate-500">La vinculación académica y la titularidad se mantienen protegidas.</p></div>
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><p><strong>Curso y división:</strong> {classroom.course_name} · {classroom.division_name}</p><p className="mt-1"><strong>Materia:</strong> {classroom.subject_name??"Espacio general"}</p></div>
      <input type="hidden" name="slug" value={slug}/><input type="hidden" name="classroom_id" value={classroomId}/>
      <label className="block text-sm font-semibold text-slate-700">Nombre del aula<input name="title" required minLength={3} maxLength={160} defaultValue={classroom.title} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"/></label>
      <label className="block text-sm font-semibold text-slate-700">Descripción<textarea name="description" maxLength={2000} rows={4} defaultValue={classroom.description??""} placeholder="Propósito, contenidos, metodología e indicaciones generales..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"/></label>
      <div className="flex items-start gap-3 rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-900"><ShieldCheck size={19} className="mt-0.5 shrink-0"/><p>Los datos académicos —institución, curso, división, materia y docente responsable— no se modifican desde esta pantalla.</p></div>
      <div className="flex justify-end border-t border-slate-100 pt-5"><button className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800"><Save size={16}/> Guardar datos generales</button></div>
    </AjaxForm>
    <AjaxForm action={updateTeacherClassroomPreferences} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <input type="hidden" name="slug" value={slug}/><input type="hidden" name="classroom_id" value={classroomId}/>
      <div><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><Palette size={20}/></span><div><h2 className="text-lg font-bold text-slate-900">Apariencia y experiencia</h2><p className="text-sm text-slate-500">Preferencias personales de visualización para esta aula.</p></div></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">Color del aula<select name="accent_theme" defaultValue={preferences.accent_theme} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal"><option value="indigo">Índigo · clásico</option><option value="ocean">Océano · azul y cian</option><option value="emerald">Esmeralda · verde</option><option value="sunset">Atardecer · naranja</option><option value="violet">Violeta · creativo</option></select></label>
        <label className="block text-sm font-semibold text-slate-700">Densidad de pantalla<select name="layout_density" defaultValue={preferences.layout_density} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal"><option value="comfortable">Cómoda · más espacio</option><option value="compact">Compacta · más contenido</option></select></label>
        <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">Sección inicial al entrar<select name="default_section" defaultValue={preferences.default_section} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal"><option value="news">Novedades</option><option value="work">Actividades</option><option value="people">Personas</option>{caps.can_attendance?<option value="attendance">Asistencia del aula</option>:null}{caps.can_grade?<option value="grades">Seguimiento trimestral</option>:null}</select></label>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700"><input type="checkbox" name="show_header_stats" defaultChecked={preferences.show_header_stats} className="mt-0.5"/><span><strong className="block">Mostrar indicadores del aula</strong><span className="text-xs text-slate-500">Mensajes, actividades y entregas en la cabecera.</span></span></label>
      <div className="flex justify-end border-t border-slate-100 pt-5"><button className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800"><Save size={16}/> Guardar preferencias</button></div>
    </AjaxForm>
  </div></main>;
}
