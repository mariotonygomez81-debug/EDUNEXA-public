import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowLeft, Camera, GraduationCap, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { saveTeacherProfile } from "./actions";

export default async function TeacherProfilePage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{saved?:string;error?:string}>}) {
  const {slug}=await params; const query=await searchParams; const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const {data:roleRows}=await supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id);
  if(!(roleRows??[]).some((row)=>row.roles?.key==="teacher")) redirect(`/dashboard/${slug}`);
  const {data:profile}=await supabase.from("profiles").select("first_name,last_name,display_name,phone,avatar_path,address,professional_titles,avatar_style").eq("id",user.id).maybeSingle();
  let avatarUrl:string|null=null;
  if(profile?.avatar_path){const {data}=await supabase.storage.from("teacher-profile-photos").createSignedUrl(profile.avatar_path,600);avatarUrl=data?.signedUrl??null;}
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8"><div className="mx-auto max-w-5xl space-y-6">
    <Link href={`/dashboard/${slug}/teaching`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a mi sección docente</Link>
    <header className="rounded-3xl bg-gradient-to-br from-[#10264b] via-[#174b86] to-[#315fbd] p-7 text-white shadow-xl shadow-blue-950/10 sm:p-9"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold"><GraduationCap size={14}/> PERFIL PROFESIONAL</span><h1 className="mt-4 text-3xl font-bold">Mi perfil docente</h1><p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Administrá tus datos de contacto y formación.</p></header>
    {query.saved?<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Perfil actualizado correctamente.</div>:null}
    {query.error?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error==="photo"?"La foto debe ser JPG, PNG o WEBP y pesar hasta 5 MB.":"No se pudo guardar el perfil. Revisá los datos e intentá nuevamente."}</div>:null}
    <form action={saveTeacherProfile} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <input type="hidden" name="slug" value={slug}/>
      <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-slate-50 p-5">
        {avatarUrl?<Image src={avatarUrl} alt="Foto de perfil docente" width={104} height={104} unoptimized className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white shadow-sm"/>:<div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 ring-4 ring-white"><UserRound size={32}/></div>}
        <label className="text-sm font-semibold text-slate-800"><span className="flex items-center gap-2"><Camera size={16}/> Foto de perfil</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="mt-2 block max-w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700"/><span className="mt-1 block text-xs font-normal text-slate-400">JPG, PNG o WEBP · Máximo 5 MB</span></label>
      </div>
      <div><h2 className="mb-3 text-lg font-bold text-slate-900">Datos personales y de contacto</h2><div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Nombre<input readOnly value={profile?.first_name??""} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal"/></label>
        <label className="text-sm font-semibold">Apellido<input readOnly value={profile?.last_name??""} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal"/></label>
        <label className="text-sm font-semibold">Teléfono de contacto<input name="phone" defaultValue={profile?.phone??""} maxLength={40} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" placeholder="+54..."/></label>
        <label className="text-sm font-semibold">Dirección<input name="address" defaultValue={profile?.address??""} maxLength={240} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" placeholder="Domicilio"/></label>
      </div></div>
      <div><h2 className="mb-3 text-lg font-bold text-slate-900">Avatar cuando no hay foto</h2><label className="block text-sm font-semibold">Elegí el avatar que querés mostrar<select name="avatar_style" defaultValue={profile?.avatar_style??"neutral"} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="neutral">Neutro</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option></select></label><p className="mt-1 text-xs text-slate-500">Se utiliza únicamente cuando no hay una fotografía cargada.</p></div>
      <div><h2 className="mb-3 text-lg font-bold text-slate-900">Formación profesional</h2><label className="block text-sm font-semibold">Títulos y formación profesional<textarea name="professional_titles" defaultValue={profile?.professional_titles??""} maxLength={2000} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" placeholder="Títulos, profesorados, licenciaturas, especializaciones y cursos..."/></label></div>
      <p className="text-xs leading-5 text-slate-500">Estos datos personales se mantienen privados en tu perfil. La foto se almacena en un espacio privado y no se publica mediante un enlace abierto.</p>
      <div className="flex justify-end"><button className="rounded-xl border border-emerald-200 bg-emerald-100 px-5 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-200">Guardar perfil</button></div>
    </form>
  </div></main>;
}
