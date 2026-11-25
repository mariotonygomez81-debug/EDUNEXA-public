import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowLeft, Bell, Camera, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { saveInstitutionalProfile } from "./actions";

export default async function InstitutionalProfilePage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{saved?:string;error?:string}>}) {
  const {slug}=await params; const query=await searchParams; const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const {data:roles}=await supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
  const roleKeys=(roles??[]).map(row=>row.roles?.key).filter(Boolean) as string[];
  const allowed=roleKeys.some(role=>["institution_admin","administrative","director","prefect"].includes(role));
  if(!allowed) redirect(roleKeys.includes("teacher")?"/dashboard/"+slug+"/teaching/profile":roleKeys.includes("student")?"/dashboard/"+slug+"/student/profile":"/dashboard/"+slug);
  const {data:profile}=await supabase.from("profiles").select("first_name,last_name,display_name,phone,address,avatar_path,avatar_style").eq("id",user.id).maybeSingle();
  let avatarUrl:string|null=null;
  if(profile?.avatar_path){const {data}=await supabase.storage.from("teacher-profile-photos").createSignedUrl(profile.avatar_path,600);avatarUrl=data?.signedUrl??null;}
  const name=[profile?.first_name,profile?.last_name].filter(Boolean).join(" ").trim()||profile?.display_name||"Usuario institucional";
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8"><div className="mx-auto max-w-4xl space-y-6">
    <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a mi espacio</Link>
    <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold"><UserRound size={14}/> PERFIL PERSONAL</span><h1 className="mt-4 text-3xl font-bold">Mi perfil</h1><p className="mt-2 text-sm text-indigo-100">{institution.display_name} · {roleKeys.join(" · ")}</p><div className="mt-5 flex items-center gap-4">{avatarUrl?<Image src={avatarUrl} alt="Foto de perfil" width={88} height={88} unoptimized className="h-22 w-22 rounded-2xl border-2 border-white/30 object-cover"/>:<div className="grid h-22 w-22 place-items-center rounded-2xl bg-white/10"><UserRound size={36}/></div>}<div><p className="text-xl font-bold">{name}</p><p className="text-sm text-indigo-100">{profile?.display_name||"Completá tu información personal"}</p></div></div></header>
    {query.saved?<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Perfil actualizado correctamente.</p>:null}
    {query.error?<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error==="photo"?"La foto debe ser JPG, PNG o WEBP y pesar hasta 5 MB.":query.error==="upload"?"No se pudo cargar la fotografía.":"No se pudo guardar el perfil. Revisá los datos."}</p>:null}
    <form action={saveInstitutionalProfile} encType="multipart/form-data" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="slug" value={slug}/>
      <div><h2 className="font-bold text-slate-900">Identidad y contacto</h2><p className="mt-1 text-xs text-slate-500">Los nombres oficiales son administrados por la institución. Podés completar tu nombre visible y tus datos de contacto.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Nombre oficial<input readOnly value={profile?.first_name??""} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal"/></label>
        <label className="text-sm font-semibold">Apellido oficial<input readOnly value={profile?.last_name??""} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal"/></label>
        <label className="text-sm font-semibold sm:col-span-2">Nombre visible<input name="display_name" defaultValue={profile?.display_name??name} maxLength={120} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"/></label>
        <label className="text-sm font-semibold">Teléfono<input name="phone" defaultValue={profile?.phone??""} maxLength={40} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" placeholder="+54..."/></label>
        <label className="text-sm font-semibold">Dirección<input name="address" defaultValue={profile?.address??""} maxLength={240} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"/></label>
      </div>
      <div className="border-t border-slate-100 pt-5"><h2 className="font-bold text-slate-900">Fotografía y avatar</h2><label className="mt-3 block text-sm font-semibold"><span className="flex items-center gap-2"><Camera size={16}/> Foto de perfil</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-800"/><span className="mt-1 block text-xs font-normal text-slate-400">JPG, PNG o WEBP · Máximo 5 MB · Almacenamiento privado</span></label>
      <label className="mt-4 block text-sm font-semibold">Avatar si no hay fotografía<select name="avatar_style" defaultValue={profile?.avatar_style??"neutral"} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="neutral">Neutro</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option></select></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><Link href={`/dashboard/${slug}/notifications`} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-800"><Bell size={16}/> Mis notificaciones</Link><button className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800">Guardar perfil</button></div>
    </form>
  </div></main>;
}
