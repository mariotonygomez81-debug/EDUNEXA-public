import { Activity, ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarCheck, CalendarDays, CheckCircle2, ChevronDown, ClipboardList, GraduationCap, LayoutDashboard, MessageSquare, MoreHorizontal, Search, Settings2, ShieldCheck, Users, UserRound, UserRoundCheck, WalletCards } from "lucide-react";

const metrics = [
  { label: "Estudiantes", value: "1.524", detail: "Matrícula ilustrativa", icon: GraduationCap },
  { label: "Personal", value: "108", detail: "Equipo institucional de muestra", icon: Users },
  { label: "Asistencia de hoy", value: "94,8%", detail: "Registros de demostración", icon: CalendarCheck },
  { label: "Familias vinculadas", value: "1.610", detail: "Cuentas ilustrativas", icon: UserRoundCheck },
];
const activity = [
  { initials: "LP", name: "Lucía Pérez", action: "Asistencia registrada", detail: "3.er año · División A", time: "08:12", tone: "violet" },
  { initials: "MG", name: "Mateo Gómez", action: "Calificación cargada", detail: "Matemática · Evaluación 2", time: "08:05", tone: "blue" },
  { initials: "SL", name: "Sofía López", action: "Nueva entrega", detail: "Aula virtual · Ciencias", time: "07:48", tone: "green" },
  { initials: "TF", name: "Tomás Fernández", action: "Justificación pendiente", detail: "3.er año · División A", time: "07:32", tone: "amber" },
];
const modules = [
  { name: "Alumnos", description: "Legajos, inscripciones y trayectorias", icon: GraduationCap, color: "purple" },
  { name: "Asistencia", description: "Presentismo y justificaciones", icon: CalendarCheck, color: "blue" },
  { name: "Calificaciones", description: "Evaluaciones e informes", icon: ClipboardList, color: "green" },
  { name: "Aula virtual", description: "Clases, tareas y materiales", icon: BookOpen, color: "orange" },
];
function NavItem({ icon: Icon, label, active = false }: { icon: React.ElementType; label: string; active?: boolean }) {
  return <a href="#modulos" className={`nav-link ${active ? "active" : ""}`}><Icon size={18} strokeWidth={1.8}/><span>{label}</span>{active && <i className="nav-dot"/>}</a>;
}
export default function Home() {
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><GraduationCap size={23}/></div><div><strong>PIE</strong><span>Plataforma Educativa</span></div></div>
      <div className="school-switch"><div className="school-avatar">CD</div><div className="school-name"><strong>Colegio Demo</strong><span>Institución de muestra</span></div><ChevronDown size={16}/></div>
      <div className="nav-section"><span className="nav-caption">GENERAL</span><NavItem icon={LayoutDashboard} label="Panel principal" active/><NavItem icon={Activity} label="Actividad"/><NavItem icon={MessageSquare} label="Comunicaciones"/></div>
      <div className="nav-section"><span className="nav-caption">GESTIÓN ACADÉMICA</span><NavItem icon={GraduationCap} label="Alumnos"/><NavItem icon={CalendarCheck} label="Asistencia"/><NavItem icon={ClipboardList} label="Calificaciones"/><NavItem icon={BookOpen} label="Aula virtual"/><NavItem icon={CalendarDays} label="Calendario"/></div>
      <div className="nav-section"><span className="nav-caption">INSTITUCIÓN</span><NavItem icon={Users} label="Personal"/><NavItem icon={UserRound} label="Familias"/><NavItem icon={WalletCards} label="Administración"/></div>
      <div className="sidebar-bottom"><div className="security-note"><ShieldCheck size={17}/><div><strong>Entorno protegido</strong><span>Acceso institucional</span></div></div><NavItem icon={Settings2} label="Configuración"/><div className="profile-mini"><div className="profile-avatar">AD</div><div><strong>Administrador</strong><span>Vista de demostración</span></div><MoreHorizontal size={18}/></div></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">Institución <span>/</span> <strong>Panel principal</strong></div><div className="top-actions"><div className="search-box"><Search size={16}/><span>Buscar en la plataforma...</span><kbd>⌘ K</kbd></div><button className="icon-button" aria-label="Notificaciones"><Bell size={19}/><i/></button><div className="top-avatar">AD</div></div></header>
      <div className="content-wrap">
        <div className="welcome-row"><div><div className="eyebrow">MIÉRCOLES, 19 DE NOVIEMBRE DE 2026</div><h1>¡Buen día, Administrador!</h1><p>Este es el resumen de actividad de tu institución.</p></div><button className="period-button"><CalendarDays size={16}/> Ciclo lectivo 2026 <ChevronDown size={15}/></button></div>
        <div className="demo-banner"><div className="demo-icon"><ShieldCheck size={18}/></div><div><strong>Panel de demostración</strong><span>Los indicadores y movimientos son ficticios. La conexión con la base de datos se habilitará en una próxima etapa.</span></div><b className="demo-tag">MODO DEMO</b></div>
        <div className="section-heading"><div><h2>Resumen institucional</h2><p>Indicadores generales del establecimiento</p></div><button className="text-button">Ver informes <ArrowRight size={15}/></button></div>
        <div className="metric-grid">{metrics.map(item => {const Icon=item.icon;return <article className="metric-card" key={item.label}><div className="metric-top"><span>{item.label}</span><div className="metric-icon"><Icon size={19}/></div></div><div className="metric-value">{item.value}</div><div className="metric-foot"><ArrowUpRight size={14}/><span>{item.detail}</span></div></article>})}</div>
        <div className="dashboard-grid">
          <section className="panel"><div className="panel-heading"><div><h3>Actividad reciente</h3><p>Últimos movimientos de la demostración</p></div><button className="more-button" aria-label="Más opciones"><MoreHorizontal size={20}/></button></div><div className="activity-list">{activity.map(item=><div className="activity-item" key={item.name}><div className={`person-initials ${item.tone}`}>{item.initials}</div><div className="activity-copy"><strong>{item.name}</strong><span>{item.action} <i>·</i> {item.detail}</span></div><time>{item.time}</time></div>)}</div><button className="panel-link">Ver toda la actividad <ArrowRight size={15}/></button></section>
          <section className="panel"><div className="panel-heading"><div><h3>Asistencia de hoy</h3><p>Vista ilustrativa del presentismo</p></div><button className="more-button" aria-label="Más opciones"><MoreHorizontal size={20}/></button></div><div className="attendance-summary"><div className="donut"><div><strong>94,8%</strong><span>Presentes</span></div></div><div className="attendance-legend"><div><i className="legend-dot present"/><span>Presentes</span><strong>1.445</strong></div><div><i className="legend-dot absent"/><span>Ausentes</span><strong>62</strong></div><div><i className="legend-dot late"/><span>Tarde</span><strong>17</strong></div></div></div><div className="attendance-bottom"><span><CheckCircle2 size={15}/> Datos de ejemplo</span><button>Ver asistencia <ArrowRight size={14}/></button></div></section>
        </div>
        <div className="section-heading modules-heading" id="modulos"><div><h2>Accesos rápidos</h2><p>Ingresá directamente a los módulos principales</p></div><button className="text-button">Todos los módulos <ArrowRight size={15}/></button></div>
        <div className="module-grid">{modules.map(item=>{const Icon=item.icon;return <a href="#modulos" className="module-card" key={item.name}><div className={`module-icon ${item.color}`}><Icon size={21}/></div><div><strong>{item.name}</strong><span>{item.description}</span></div><ArrowRight className="module-arrow" size={17}/></a>})}</div>
        <footer className="footer"><span>© 2026 Plataforma Integral Educativa</span><span>Construyendo una comunidad educativa conectada</span></footer>
      </div>
    </section>
  </main>;
}
