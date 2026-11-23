import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ShieldCheck, KeyRound } from "lucide-react";
import { joinClassroomByInvite } from "./actions";

export default async function JoinClassroomPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; school?: string; code?: string; error?: string }>;
}) {
  const query = await searchParams;
  const token = query.token ?? "";
  const school = query.school ?? "";
  const code = query.code ?? "";
  if (token && !/^[0-9a-f-]{36}$/i.test(token)) redirect("/join/classroom?error=invalid");
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-slate-800">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl"/>
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl"/>
      <section className="relative w-full max-w-lg rounded-[2rem] border border-white/70 bg-white p-7 shadow-2xl shadow-black/20 sm:p-9">
        <Link href="/login" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">EDUNEXA</Link>
        <div className="mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><BookOpen size={28}/></div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">Unirse a un aula</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Ingresá el código que te compartió tu docente o continuá con el enlace de invitación.</p>
        {query.error ? <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">El código o enlace no es válido, venció o tu matrícula no corresponde a esta aula.</div> : null}
        <form action={joinClassroomByInvite} className="mt-6 space-y-4">
          <input type="hidden" name="school" value={school}/>
          <input type="hidden" name="token" value={token}/>
          {!token ? <label className="block text-sm font-semibold text-slate-700">Código de clase<input name="code" defaultValue={code} required minLength={6} maxLength={16} autoCapitalize="characters" placeholder="Ej.: A7C92F14B0" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-lg tracking-widest outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"/></label> : <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900"><p className="font-semibold">Invitación detectada</p><p className="mt-1">El enlace contiene la invitación. Iniciá sesión para validar tu matrícula y unirte al aula.</p></div>}
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-700/20 transition hover:-translate-y-0.5 hover:bg-indigo-800"><KeyRound size={17}/> Unirme al aula</button>
        </form>
        <div className="mt-6 flex items-start gap-2 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600"/> Solo pueden incorporarse estudiantes con matrícula activa en la división correspondiente y pertenencia vigente a la institución.</div>
      </section>
    </main>
  );
}
