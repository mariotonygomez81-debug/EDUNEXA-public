type Props = {
  institutionName: string;
  institutionSlug: string;
  expiresAt: string;
  delegationId: string;
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
  institutionName, institutionSlug, expiresAt, delegationId,
}: Props) {
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
            {modules.map(([name, detail]) => (
              <article key={name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <h3 className="font-semibold text-white">{name}</h3>
                <p className="mt-1 text-sm text-slate-400">{detail}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-amber-200">Contexto validado · lectura restringida</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500">
          <span>EDUNEXA · {institutionSlug}</span>
          <a href="/dashboard/platform" className="rounded-xl border border-white/15 px-4 py-2 font-semibold text-slate-200 hover:bg-white/10">
            Volver al centro global
          </a>
        </footer>
      </div>
    </main>
  );
}
