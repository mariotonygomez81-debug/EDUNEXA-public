import Link from "next/link";
import { useState } from "react";

type Props = {
  institutionName: string;
  institutionSlug: string;
  expiresAt: string;
  delegationId: string;
  moduleScopes: string[];
};

const modules = [
  ["Docentes", "Enseñanza y aulas"],
  ["Preceptor", "Seguimiento y asistencia"],
  ["Alumnos", "Trayectoria educativa"],
  ["Tutor", "Comunidad y seguimiento familiar"],
  ["Directivos", "Supervisión institucional"],
  ["Administrativos", "Documentación y registros"],
  ["Administrador", "Configuración y permisos del colegio"],
] as const;

export default function DelegatedSupportWorkspace({
  institutionName, institutionSlug, expiresAt, delegationId, moduleScopes,
}: Props) {
  const [selectedModule, setSelectedModule] = useState("");
  const [moduleData, setModuleData] = useState<Record<string, unknown> | null>(null);
  const [loadingModule, setLoadingModule] = useState(false);
  const [moduleError, setModuleError] = useState("");
  const moduleLabels: Record<string, string> = {
    docentes: "Docentes", preceptor: "Preceptor", alumnos: "Alumnos", tutor: "Tutor",
    directivos: "Directivos", administrativos: "Administrativos", administrador: "Administrador",
  };
  async function inspectModule(moduleKey: string) {
    setSelectedModule(moduleKey); setLoadingModule(true); setModuleError(""); setModuleData(null);
    try {
      const response = await fetch(`/api/platform/delegations/${delegationId}/modules/${moduleKey}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "No se pudo consultar el módulo.");
      setModuleData(result.module as Record<string, unknown>);
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Consulta no disponible.");
    } finally { setLoadingModule(false); }
  }
  const expiration = new Date(expiresAt);
  const formattedExpiration = Number.isNaN(expiration.getTime())
    ? "Vencimiento no disponible"
    : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(expiration);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.07] p-6">
          <p className="text-xs font-bold tracking-[0.18em] text-amber-200">MODO DE SOPORTE DELEGADO · SOLO LECTURA</p>
          <h1 className="mt-3 text-3xl font-black">{institutionName}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Acceso temporal aprobado por otro Superadministrador. Este contexto no suplanta a un usuario,
            no crea una membresía institucional y no habilita cambios ni acceso a expedientes personales.
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <dt className="text-xs text-slate-400">Vence</dt>
              <dd className="mt-1 font-semibold">{formattedExpiration}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <dt className="text-xs text-slate-400">Referencia de auditoría</dt>
              <dd className="mt-1 break-all font-mono text-xs">{delegationId}</dd>
            </div>
          </dl>
        </header>

        <section>
          <h2 className="text-xl font-bold">Áreas institucionales bajo supervisión</h2>
          <p className="mt-1 text-sm text-slate-400">
            La autorización vigente se limita a contexto institucional y auditoría. No se habilita lectura de datos personales o académicos.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.filter(([name]) => moduleScopes.includes(Object.entries(moduleLabels).find(([, label]) => label === name)?.[0] ?? ""))
              .map(([name, detail]) => {
                const key = Object.entries(moduleLabels).find(([, label]) => label === name)?.[0] ?? "";
                return <article key={key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="font-semibold text-white">{name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{detail}</p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-amber-200">Permiso específico · solo lectura</p>
                  <button type="button" onClick={() => void inspectModule(key)} className="mt-3 rounded-lg border border-amber-200/20 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-100/10">Consultar configuración segura</button>
                </article>;
              })}
          </div>
          {moduleScopes.length === 0 && <p className="mt-4 rounded-xl border border-rose-300/20 p-3 text-sm text-rose-100">Esta autorización no tiene módulos habilitados. No se permite el acceso.</p>}
          {selectedModule && <section className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-white">{moduleLabels[selectedModule] ?? selectedModule} · configuración permitida</h3>
              <button type="button" onClick={() => { setSelectedModule(""); setModuleData(null); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300">Cerrar</button>
            </div>
            {loadingModule && <p className="mt-3 text-sm text-slate-400">Consultando con autorización vigente…</p>}
            {moduleError && <p role="alert" className="mt-3 text-sm text-rose-200">{moduleError}</p>}
            {moduleData && <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-cyan-100">{JSON.stringify(moduleData.configuration ?? {}, null, 2)}</pre>}
          </section>}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500">
          <span>EDUNEXA · {institutionSlug}</span>
          <Link href="/dashboard/platform" className="rounded-xl border border-white/15 px-4 py-2 font-semibold text-slate-200 hover:bg-white/10">
            Volver al centro global
          </Link>
        </footer>
      </div>
    </main>
  );
}
