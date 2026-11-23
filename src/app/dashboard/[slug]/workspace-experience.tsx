"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, Bell, BookOpen, CalendarCheck,
  CheckCircle2, ClipboardList, FileText, GraduationCap, LayoutGrid,
  LifeBuoy, List, Megaphone, MessagesSquare, Search,
  ShieldCheck, Sparkles, Users, X,
} from "lucide-react";

type WorkspaceModule = {
  name: string;
  detail: string;
  href: string;
  icon: string;
  category: "Académico" | "Gestión" | "Comunidad";
  unread?: number;
};
type QuickLink = { title: string; detail: string; href: string; icon: string; tone: string };

const iconMap = {
  students: GraduationCap, administrative: FileText, attendance: CalendarCheck,
  grades: ClipboardList, report: FileText, classroom: BookOpen, announcements: Megaphone,
  messages: MessagesSquare, notifications: Bell, portal: GraduationCap,
  profile: Users, appointments: CalendarCheck, reports: Activity, direction: Activity,
  prefect: Users, users: ShieldCheck, calendar: CalendarCheck, structure: LayoutGrid,
  scales: ClipboardList, support: LifeBuoy,
} as const;

const palettes: Record<string, string> = {
  students: "lavender", administrative: "blue", attendance: "mint", grades: "amber",
  report: "blue", classroom: "violet", announcements: "coral", messages: "cyan",
  notifications: "amber", portal: "mint",
};

export function WorkspaceExperience({
  institutionName, roleNames, modules, quickLinks, unreadCount, assignmentCount, signOutAction,
}: {
  institutionName: string;
  roleNames: string[];
  modules: WorkspaceModule[];
  quickLinks: QuickLink[];
  unreadCount: number;
  assignmentCount: number;
  signOutAction: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => modules.filter((item) => {
    const matchesQuery = (item.name + " " + item.detail).toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"));
    return matchesQuery && (category === "Todos" || item.category === category);
  }), [modules, query, category]);
  const visible = showAll ? filtered : filtered.slice(0, 8);
  const profileLabel = roleNames.length ? roleNames.join(" · ") : "Equipo institucional";

  return (
    <main className="edx-workspace">
      <header className="edx-topbar">
        <Link href="/dashboard" className="edx-brand-lockup" aria-label="EDUNEXA, seleccionar institución">
          <span className="edx-brand-symbol"><Sparkles size={20}/></span>
          <span><strong>EDUNEXA</strong><small>PLATAFORMA EDUCATIVA</small></span>
        </Link>
        <div className="edx-topbar-right">
          <span className="edx-secure-pill"><ShieldCheck size={14}/> Entorno protegido</span>
          <form action={signOutAction}><button className="edx-logout" type="submit">Cerrar sesión <ArrowDownRight size={15}/></button></form>
        </div>
      </header>

      <div className="edx-workspace-body">
        <section className="edx-hero-panel">
          <div className="edx-hero-orb edx-orb-one"/><div className="edx-hero-orb edx-orb-two"/>
          <div className="edx-hero-content">
            <div className="edx-eyebrow"><span/> TU ESPACIO DE TRABAJO</div>
            <p className="edx-hero-greeting">Tu perfil institucional · {profileLabel}</p>
            <h1>{institutionName}<br/><em>Todo conectado.</em></h1>
            <p className="edx-hero-description">Una visión clara de la vida institucional. Encontrá tus herramientas, seguí la actividad y avanzá con menos pasos.</p>
            <div className="edx-role-tags">{roleNames.map((role) => <span key={role}>{role}</span>)}</div>
            {quickLinks.some((item) => item.href.endsWith("/classroom") || item.href.endsWith("/teaching/profile")) && <nav aria-label="Accesos rápidos docentes" className="mt-6 flex flex-wrap gap-3">
              {quickLinks.filter((item) => item.href.endsWith("/classroom") || item.href.endsWith("/teaching/profile")).map((item) => {
                const Icon = iconMap[item.icon as keyof typeof iconMap] || ArrowRight;
                const isClassroom = item.href.endsWith("/classroom");
                return <Link key={item.href} href={item.href} className={isClassroom ? "inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-200" : "inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-100 px-4 py-3 text-sm font-semibold text-violet-950 shadow-sm transition-colors hover:bg-violet-200"}><Icon size={17}/>{item.title}</Link>;
              })}
            </nav>}
          </div>
          <div className="edx-hero-art" aria-hidden="true">
            <div className="edx-art-ring ring-a"/><div className="edx-art-ring ring-b"/>
            <div className="edx-art-core"><Sparkles size={36}/><span>EDU<br/>NEXA</span></div>
            <div className="edx-art-node node-a"><BookOpen size={19}/></div>
            <div className="edx-art-node node-b"><Users size={19}/></div>
            <div className="edx-art-node node-c"><Activity size={19}/></div>
            <div className="edx-art-node node-d"><CalendarCheck size={19}/></div>
            <span className="edx-art-caption">EDUCACIÓN · DATOS · COMUNIDAD</span>
          </div>
          <div className="edx-hero-bottom"><span><CheckCircle2 size={14}/> Acceso según tus permisos</span><span>Un solo espacio, múltiples posibilidades <ArrowRight size={14}/></span></div>
        </section>

        <section className="edx-insight-row" aria-label="Resumen de tu espacio">
          <article className="edx-insight-card insight-indigo"><span className="edx-insight-icon"><LayoutGrid size={19}/></span><div><small>HERRAMIENTAS DISPONIBLES</small><strong>{modules.length.toString().padStart(2,"0")}</strong><span>Módulos habilitados para tu perfil</span></div><i><Sparkles size={17}/></i></article>
          <article className="edx-insight-card insight-orange"><span className="edx-insight-icon"><Bell size={19}/></span><div><small>NOTIFICACIONES PENDIENTES</small><strong>{unreadCount}</strong><span>{unreadCount === 1 ? "Aviso para revisar" : "Avisos para revisar"}</span></div><i><ArrowRight size={17}/></i></article>
          <article className="edx-insight-card insight-green"><span className="edx-insight-icon"><CalendarCheck size={19}/></span><div><small>ASIGNACIONES ACTIVAS</small><strong>{assignmentCount}</strong><span>Responsabilidades vigentes</span></div><i><Activity size={17}/></i></article>
        </section>

        {quickLinks.filter((item) => !item.href.endsWith("/classroom") && !item.href.endsWith("/teaching/profile")).length > 0 && <section className="edx-quick-section">
          <div className="edx-section-heading"><div><span className="edx-section-kicker">ACCESO DIRECTO</span><h2>Atajos para tu jornada</h2><p>Las herramientas que más necesitás, a un solo clic.</p></div><span className="edx-heading-spark"><Sparkles size={19}/></span></div>
          <div className="edx-quick-grid">{quickLinks.filter((item) => !item.href.endsWith("/classroom") && !item.href.endsWith("/teaching/profile")).map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap] || ArrowRight;
            return <Link href={item.href} className={`edx-quick-card ${item.tone}`} key={item.href}><span className="edx-quick-icon"><Icon size={20}/></span><span className="edx-quick-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRightIcon/></Link>;
          })}</div>
        </section>}

        <section className="edx-modules-section">
          <div className="edx-section-heading edx-modules-heading"><div><span className="edx-section-kicker">CENTRO DE HERRAMIENTAS</span><h2>Explorá tus módulos</h2><p>Todo lo que necesitás para gestionar, enseñar y acompañar.</p></div><div className="edx-view-toggle"><button type="button" aria-label="Vista en tarjetas" aria-pressed={view === "grid"} className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")}><LayoutGrid size={16}/></button><button type="button" aria-label="Vista en lista" aria-pressed={view === "list"} className={view === "list" ? "selected" : ""} onClick={() => setView("list")}><List size={17}/></button></div></div>
          <div className="edx-module-controls">
            <label className="edx-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar un módulo o herramienta..." aria-label="Buscar módulos"/>{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={15}/></button>}<kbd>⌘ K</kbd></label>
            <div className="edx-filter-pills">{["Todos","Académico","Gestión","Comunidad"].map((item) => <button key={item} type="button" className={category === item ? "active" : ""} onClick={() => {setCategory(item);setShowAll(false);}}>{item}</button>)}</div>
          </div>
          {visible.length ? <div className={view === "grid" ? "edx-module-grid" : "edx-module-grid edx-list-view"}>{visible.map((item, index) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap] || BookOpen;
            const tone = palettes[item.icon] || ["violet","mint","blue","amber"][index % 4];
            return <Link href={item.href} className={`edx-module-card tone-${tone}`} key={item.href}><span className="edx-module-number">{String(index + 1).padStart(2,"0")}</span><span className="edx-module-icon"><Icon size={22}/></span><span className="edx-module-copy"><strong>{item.name}</strong><small>{item.detail}</small></span>{item.unread ? <span className="edx-unread-count">{item.unread > 99 ? "99+" : item.unread}</span> : null}<span className="edx-module-arrow"><ArrowUpRightIcon/></span></Link>;
          })}</div> : <div className="edx-empty-state"><Search size={25}/><strong>No encontramos ese módulo</strong><span>Probá con otra palabra o cambiá el filtro.</span><button type="button" onClick={() => {setQuery("");setCategory("Todos");}}>Ver todos los módulos</button></div>}
          {filtered.length > 8 && <button type="button" className="edx-show-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Mostrar menos" : `Ver los ${filtered.length} módulos`} <ArrowRight size={15}/></button>}
        </section>

        <footer className="edx-workspace-footer"><span><ShieldCheck size={15}/> Tus datos están protegidos y separados por institución.</span><span>EDUNEXA <i/> Tecnología que conecta la educación</span></footer>
      </div>
    </main>
  );
}

function ArrowUpRightIcon() {
  return <span className="edx-arrow-up-right"><ArrowRight size={17}/></span>;
}
