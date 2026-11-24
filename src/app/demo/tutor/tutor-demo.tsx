"use client";

import { useState, type FormEvent } from "react";
import {
  Bell, BookOpen, CalendarCheck, CalendarClock, CheckCheck,
  ChevronRight, ClipboardList, Download, FileText, GraduationCap,
  LayoutDashboard, MessageCircle, Search, ShieldCheck, TrendingUp, UserRound,
  UserPlus, Users, Save, CheckCircle2,
} from "lucide-react";

type Section = "resumen" | "tareas" | "calificaciones" | "boletines" | "avisos" | "perfil" | "hijos";

const students = [
  {
    id: "sofia",
    dni: "99123456",
    birthDate: "2012-05-14",
    name: "Sofía Gómez",
    initials: "SG",
    course: "2.º año",
    division: "División A",
    year: "Ciclo lectivo 2026",
    attendance: { present: 82, absent: 4, late: 3, justified: 2 },
    grades: [
      { subject: "Matemática", grade: "8", percent: 80, trend: "En mejora" },
      { subject: "Lengua", grade: "9", percent: 90, trend: "Estable" },
      { subject: "Ciencias Naturales", grade: "8", percent: 80, trend: "En mejora" },
      { subject: "Historia", grade: "7", percent: 70, trend: "Estable" },
    ],
    tasks: [
      { subject: "Matemática", title: "Trabajo práctico: fracciones", due: "28 nov 2026", status: "Sin entregar" },
      { subject: "Lengua", title: "Lectura comprensiva", due: "21 nov 2026", status: "Aprobada" },
      { subject: "Ciencias Naturales", title: "Informe de laboratorio", due: "25 nov 2026", status: "Entregada · pendiente" },
    ],
  },
  {
    id: "mateo",
    dni: "99234567",
    birthDate: "2015-09-22",
    name: "Mateo Gómez",
    initials: "MG",
    course: "5.º grado",
    division: "División B",
    year: "Ciclo lectivo 2026",
    attendance: { present: 91, absent: 2, late: 1, justified: 1 },
    grades: [
      { subject: "Matemática", grade: "9", percent: 90, trend: "En mejora" },
      { subject: "Prácticas del lenguaje", grade: "8", percent: 80, trend: "Estable" },
      { subject: "Ciencias", grade: "9", percent: 90, trend: "En mejora" },
      { subject: "Ciencias Sociales", grade: "8", percent: 80, trend: "Estable" },
    ],
    tasks: [
      { subject: "Matemática", title: "Problemas con medidas", due: "27 nov 2026", status: "Aprobada" },
      { subject: "Prácticas del lenguaje", title: "Producción de un cuento", due: "29 nov 2026", status: "Sin entregar" },
    ],
  },
];

const enrolledStudents = [
  ...students,
  {
    id: "valentina-demo",
    dni: "99345678",
    birthDate: "2014-03-08",
    name: "Valentina Fernández",
    initials: "VF",
    course: "6.º grado",
    division: "División A",
    year: "Ciclo lectivo 2026",
    attendance: { present: 88, absent: 3, late: 1, justified: 1 },
    grades: [
      { subject: "Matemática", grade: "8", percent: 80, trend: "Estable" },
      { subject: "Lengua", grade: "9", percent: 90, trend: "En mejora" },
    ],
    tasks: [
      { subject: "Matemática", title: "Fracciones y problemas", due: "28 nov 2026", status: "Sin entregar" },
    ],
  },
];

const notifications = [
  { type: "Mensaje", title: "Nuevo comunicado institucional", body: "Se informa el cronograma de actividades de cierre del ciclo lectivo.", date: "Hoy · 09:15", icon: MessageCircle },
  { type: "Tarea", title: "Una tarea próxima a vencer", body: "Trabajo práctico de Matemática: fecha límite 28 de noviembre.", date: "Ayer · 16:40", icon: ClipboardList },
  { type: "Citación", title: "Actualización de entrevista", body: "La institución registró una novedad en una citación.", date: "20 nov · 11:05", icon: CalendarClock },
];

const sectionItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "tareas", label: "Tareas y entregas", icon: BookOpen },
  { id: "calificaciones", label: "Calificaciones", icon: TrendingUp },
  { id: "boletines", label: "Boletines", icon: FileText },
  { id: "avisos", label: "Notificaciones", icon: Bell },
  { id: "perfil", label: "Mi perfil", icon: UserRound },
  { id: "hijos", label: "Agregar hijo", icon: UserPlus },
];

function Status({ value }: { value: string }) {
  const styles: Record<string, string> = {
    "Aprobada": "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    "En mejora": "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    "Estable": "bg-slate-100 text-slate-700 ring-slate-500/20",
    "Sin entregar": "bg-amber-50 text-amber-800 ring-amber-600/20",
    "Entregada · pendiente": "bg-sky-50 text-sky-700 ring-sky-600/20",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[value] ?? "bg-slate-100 text-slate-700 ring-slate-500/20"}`}>{value}</span>;
}

export default function TutorDemo() {
  const [studentRecords, setStudentRecords] = useState(students);
  const [activeStudent, setActiveStudent] = useState("sofia");
  const [section, setSection] = useState<Section>("resumen");
  const [tutorProfile, setTutorProfile] = useState({ fullName: "", email: "tutor.demo@edunexa.test", phone: "", address: "", relationship: "Madre / Padre / Tutor" });
  const [profileSaved, setProfileSaved] = useState(false);
  const [childForm, setChildForm] = useState({ dni: "", birthDate: "" });
  const [childMessage, setChildMessage] = useState("");
  const [readNotifications, setReadNotifications] = useState<string[]>([]);
  const [notificationFilter, setNotificationFilter] = useState<"Todas" | "Sin leer" | "Leídas">("Todas");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatus, setTaskStatus] = useState("Todas");
  const student = studentRecords.find((item) => item.id === activeStudent) ?? studentRecords[0];
  const profileCompletion = [tutorProfile.fullName, tutorProfile.email, tutorProfile.phone, tutorProfile.address].filter((value) => value.trim()).length;
  const unread = notifications.length - readNotifications.length;
  const filteredNotifications = notifications.filter((item) => notificationFilter === "Todas" || (notificationFilter === "Sin leer" ? !readNotifications.includes(item.title) : readNotifications.includes(item.title)));
  const filteredTasks = student.tasks.filter((task) =>
    (task.subject + " " + task.title + " " + task.status).toLocaleLowerCase("es").includes(taskSearch.trim().toLocaleLowerCase("es")) &&
    (taskStatus === "Todas" || task.status === taskStatus)
  );
  const taskFiltersActive = taskSearch.trim().length > 0 || taskStatus !== "Todas";

  function selectStudent(studentId: string) {
    setActiveStudent(studentId);
    setTaskSearch("");
    setTaskStatus("Todas");
  }

  function clearTaskFilters() {
    setTaskSearch("");
    setTaskStatus("Todas");
  }

  function saveTutorProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaved(true);
  }

  function addChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dni = childForm.dni.trim();
    const birthDate = childForm.birthDate;
    if (!/^\d{7,8}$/.test(dni) || !birthDate || birthDate > new Date().toISOString().slice(0, 10)) return;

    const enrolledStudent = enrolledStudents.find(
      (item) => item.dni === dni && item.birthDate === birthDate
    );

    if (!enrolledStudent) {
      setChildMessage("No encontramos un alumno matriculado con esos datos. Verificá el DNI y la fecha de nacimiento o comunicate con la institución.");
      return;
    }
    if (studentRecords.some((item) => item.id === enrolledStudent.id)) {
      setChildMessage("Este alumno ya está vinculado a tu perfil.");
      return;
    }

    setStudentRecords((current) => [...current, enrolledStudent]);
    setActiveStudent(enrolledStudent.id);
    setChildForm({ dni: "", birthDate: "" });
    setChildMessage("Alumno encontrado en la matrícula institucional y agregado a esta demostración. La autorización real deberá validarse en el sistema.");
    setSection("hijos");
  }
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs font-semibold text-amber-900">
        MODO DEMOSTRACIÓN · DATOS FICTICIOS · SIN CONEXIÓN A SUPABASE NI GROQ
      </div>

      <header className="bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-white/15 bg-white/10 p-2.5"><GraduationCap size={25} /></div>
              <div>
                <p className="text-lg font-bold tracking-wide">EDUNEXA</p>
                <p className="text-xs text-indigo-200">Portal de familias</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">
                <ShieldCheck size={14} /> Entorno de demostración
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold">TG</div>
            </div>
          </div>
          <div className="mt-8 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Portal del tutor</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Mi espacio educativo</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100 sm:text-base">
              Consultá el seguimiento académico, las tareas, las calificaciones y las comunicaciones de tus hijos desde un solo lugar.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-indigo-100">
            <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">Institución demostrativa</span>
            <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">Ciclo lectivo 2026</span>
            <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">{studentRecords.length} estudiantes vinculados</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><UserRound size={17} className="text-violet-600" /> Estudiantes vinculados</div>
            <div className="space-y-2">
              {studentRecords.map((item) => (
                <button key={item.id} onClick={() => selectStudent(item.id)} aria-pressed={activeStudent === item.id}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${activeStudent === item.id ? "border-violet-300 bg-violet-50 ring-2 ring-violet-100" : "border-slate-100 hover:bg-slate-50"}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${activeStudent === item.id ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-600"}`}>{item.initials}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{item.name}</span>
                    <span className="block text-xs text-slate-500">{item.course} · {item.division}</span>
                  </span>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setSection("hijos"); setChildMessage(""); }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-50"><UserPlus size={15} /> Agregar hijo</button>
            <p className="mt-3 text-xs leading-5 text-slate-400">Demo: los datos ingresados son ficticios y solo permanecen en esta sesión.</p>
          </section>

          <nav className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Secciones del portal">
            <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Mi portal</p>
            {sectionItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${section === id ? "bg-violet-50 text-violet-800" : "text-slate-600 hover:bg-slate-50"}`}>
                <Icon size={17} /> {label}
                {id === "avisos" && unread > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{unread}</span>}
              </button>
            ))}
          </nav>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-900">
            <div className="mb-2 flex items-center gap-2 font-bold"><ShieldCheck size={16} /> Privacidad de la demostración</div>
            Toda la información que ves está escrita en el código como ejemplo ficticio. Esta pantalla no inicia sesión ni envía información.
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">{sectionItems.find((item) => item.id === section)?.label}</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{section === "perfil" ? "Perfil del tutor" : section === "hijos" ? "Vincular un hijo" : student.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{section === "perfil" ? "Completá tus datos de contacto." : section === "hijos" ? "Agregá un estudiante con el código de vinculación de la institución." : `${student.course} · ${student.division} · ${student.year}`}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Perfil de tutor · Demo</span>
          </div>


          {section === "perfil" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-bold text-slate-900">Información personal y de contacto</h3><p className="mt-1 text-xs text-slate-500">Completá los datos para mantener actualizado tu perfil.</p></div>
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">{profileCompletion}/4 datos completos</span>
              </div>
              <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${profileCompletion * 25}%` }} /></div>
              <form onSubmit={saveTutorProfile} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Nombre y apellido *
                  <input required value={tutorProfile.fullName} onChange={(event) => { setTutorProfile({ ...tutorProfile, fullName: event.target.value }); setProfileSaved(false); }} placeholder="Ej.: María Gómez" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <label className="text-sm font-medium text-slate-700">Correo electrónico *
                  <input required type="email" value={tutorProfile.email} onChange={(event) => { setTutorProfile({ ...tutorProfile, email: event.target.value }); setProfileSaved(false); }} placeholder="nombre@correo.com" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <label className="text-sm font-medium text-slate-700">Teléfono de contacto *
                  <input required type="tel" value={tutorProfile.phone} onChange={(event) => { setTutorProfile({ ...tutorProfile, phone: event.target.value }); setProfileSaved(false); }} placeholder="Ej.: +54 9 11 1234 5678" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <label className="text-sm font-medium text-slate-700">Domicilio (opcional)
                  <input value={tutorProfile.address} onChange={(event) => { setTutorProfile({ ...tutorProfile, address: event.target.value }); setProfileSaved(false); }} placeholder="Localidad y dirección" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Vínculo con el estudiante
                  <select value={tutorProfile.relationship} onChange={(event) => { setTutorProfile({ ...tutorProfile, relationship: event.target.value }); setProfileSaved(false); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:max-w-md">
                    <option>Madre / Padre / Tutor</option><option>Madre</option><option>Padre</option><option>Tutor legal</option><option>Otro responsable autorizado</option>
                  </select>
                </label>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800"><Save size={16} /> Guardar perfil</button>
                  {profileSaved && <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={16} /> Datos guardados en esta sesión de demostración</span>}
                </div>
              </form>
              <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">La demo conserva los cambios solo mientras permanezca abierta. En el módulo real, estos datos deberán guardarse de forma segura en la cuenta autenticada del tutor.</p>
            </section>
          )}

          {section === "hijos" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-3 text-violet-700"><Users size={22} /></span><div><h3 className="font-bold text-slate-900">Agregar estudiante a mi grupo familiar</h3><p className="mt-1 text-xs text-slate-500">Ingresá únicamente el DNI y la fecha de nacimiento. Los datos académicos se recuperan de la matrícula institucional.</p></div></div>
              {childMessage && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{childMessage}</p>}
              <form onSubmit={addChild} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">DNI del estudiante *
                  <input required inputMode="numeric" autoComplete="off" maxLength={8} pattern="[0-9]{7,8}" value={childForm.dni} onChange={(event) => { setChildForm({ ...childForm, dni: event.target.value.replace(/\D/g, "").slice(0, 8) }); setChildMessage(""); }} placeholder="Ingresá 7 u 8 números" title="Ingresá un DNI de 7 u 8 números, sin puntos" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <label className="text-sm font-medium text-slate-700">Fecha de nacimiento *
                  <input required type="date" max={new Date().toISOString().slice(0, 10)} value={childForm.birthDate} onChange={(event) => { setChildForm({ ...childForm, birthDate: event.target.value }); setChildMessage(""); }} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800"><UserPlus size={16} /> Buscar y vincular alumno</button>
                  <button type="button" onClick={() => { setSection("resumen"); setChildMessage(""); setChildForm({ dni: "", birthDate: "" }); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                </div>
              </form>
              <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">El sistema buscará al alumno en la matrícula de la institución. El curso, nivel y división ya registrados no se vuelven a cargar. En producción, la vinculación deberá validar además que el tutor esté autorizado antes de mostrar información académica.</p>
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h4 className="mb-3 text-sm font-bold text-slate-900">Estudiantes vinculados ({studentRecords.length})</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {studentRecords.map((item) => <button key={item.id} type="button" onClick={() => { selectStudent(item.id); setSection("resumen"); }} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${activeStudent === item.id ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:bg-slate-50"}`}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">{item.initials}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{item.name}</span><span className="block text-xs text-slate-500">{item.course} · {item.division}</span></span><ChevronRight size={16} className="text-slate-400" /></button>)}
                </div>
              </div>
            </section>
          )}

          {section === "resumen" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Presentes", value: student.attendance.present, icon: CalendarCheck, color: "text-emerald-700 bg-emerald-50" },
                  { label: "Ausentes", value: student.attendance.absent, icon: CalendarClock, color: "text-rose-700 bg-rose-50" },
                  { label: "Tardanzas", value: student.attendance.late, icon: CalendarClock, color: "text-amber-700 bg-amber-50" },
                  { label: "Boletines", value: 3, icon: FileText, color: "text-violet-700 bg-violet-50" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`rounded-lg p-2 ${color}`}><Icon size={17} /></span></div>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
                    <p className="mt-1 text-[11px] text-slate-400">Datos de ejemplo</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="font-bold text-slate-900">Evolución académica</h3><p className="mt-1 text-xs text-slate-500">Resultados ilustrativos por materia</p></div>
                    <TrendingUp className="text-violet-600" size={20} />
                  </div>
                  <div className="mt-5 space-y-4">
                    {student.grades.map((grade) => (
                      <div key={grade.subject}>
                        <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-700">{grade.subject}</span><span className="text-xs font-bold text-slate-700">{grade.grade}/10</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500" style={{ width: `${grade.percent}%` }} /></div>
                        <div className="mt-1.5"><Status value={grade.trend} /></div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-bold text-slate-900">Actividad reciente</h3>
                  <p className="mt-1 text-xs text-slate-500">Novedades de la institución</p>
                  <div className="mt-4 space-y-4">
                    {notifications.slice(0, 2).map((item) => {
                      const Icon = item.icon;
                      return <div key={item.title} className="flex gap-3"><span className="rounded-lg bg-violet-50 p-2 text-violet-700"><Icon size={17} /></span><div><p className="text-sm font-semibold text-slate-800">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p><p className="mt-1 text-[10px] text-slate-400">{item.date}</p></div></div>;
                    })}
                  </div>
                  <button onClick={() => setSection("avisos")} className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:text-violet-900">Ver todas las notificaciones <ChevronRight size={14} /></button>
                </section>
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Próximas tareas</h3><p className="mt-1 text-xs text-slate-500">Estado de entregas y revisión docente</p></div><BookOpen className="text-violet-600" size={20} /></div>
                <div className="mt-4 divide-y divide-slate-100">
                  {student.tasks.slice(0, 2).map((task) => <div key={task.title} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-xs font-semibold text-violet-700">{task.subject}</p><p className="mt-1 text-sm font-semibold text-slate-800">{task.title}</p><p className="mt-1 text-xs text-slate-400">Vencimiento: {task.due}</p></div><Status value={task.status} /></div>)}
                </div>
              </section>
            </>
          )}

          {section === "tareas" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4"><h3 className="font-bold text-slate-900">Tareas y entregas por materia</h3><p className="mt-1 text-xs text-slate-500">Seguimiento de estados, sin mostrar archivos ni contenido privado.</p></div>
              <label className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                <Search size={16} className="shrink-0 text-slate-400" />
                <span className="sr-only">Buscar tareas por materia o título</span>
                <input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Buscar por materia o tarea..." className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
                {taskSearch && <button type="button" onClick={() => setTaskSearch("")} className="text-xs font-semibold text-violet-700">Limpiar</button>}
              </label>
              <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar tareas por estado">
                {["Todas", "Sin entregar", "Entregada · pendiente", "Aprobada"].map((status) => {
                  const count = status === "Todas" ? student.tasks.length : student.tasks.filter((task) => task.status === status).length;
                  return <button key={status} type="button" aria-pressed={taskStatus === status} onClick={() => setTaskStatus(status)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${taskStatus === status ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{status} <span className="ml-1 opacity-70">{count}</span></button>;
                })}
              </div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite">
                <span>{filteredTasks.length} de {student.tasks.length} tareas</span>
                {taskFiltersActive && <button type="button" onClick={clearTaskFilters} className="font-semibold text-violet-700 hover:text-violet-900">Quitar filtros</button>}
              </div>
              <div className="divide-y divide-slate-100">
                {filteredTasks.map((task) => <div key={task.title} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0"><p className="text-xs font-semibold text-violet-700">{task.subject}</p><p className="mt-1 font-semibold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">Fecha límite: {task.due}</p></div><Status value={task.status} /></div>)}
                {filteredTasks.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No encontramos tareas para los filtros seleccionados.</p>}
              </div>
            </section>
          )}

          {section === "calificaciones" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-900">Calificaciones por materia</h3><p className="mt-1 text-xs text-slate-500">Ejemplo de resultados publicados y evolución.</p>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
                <div className="grid grid-cols-[minmax(0,1fr)_70px_130px] gap-2 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500"><span>Materia</span><span>Nota</span><span>Estado</span></div>
                {student.grades.map((grade) => <div key={grade.subject} className="grid grid-cols-[minmax(0,1fr)_70px_130px] items-center gap-2 border-t border-slate-100 px-4 py-3"><span className="text-sm font-medium text-slate-800">{grade.subject}</span><span className="text-sm font-bold tabular-nums">{grade.grade}/10</span><span><Status value={grade.trend} /></span></div>)}
              </div>
            </section>
          )}

          {section === "boletines" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-900">Boletines oficiales publicados</h3><p className="mt-1 text-xs text-slate-500">Documentos de muestra para representar la sección de boletines.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {["Primer trimestre · 2026", "Segundo trimestre · 2026", "Tercer trimestre · 2026"].map((period) => <div key={period} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"><span className="rounded-lg bg-rose-50 p-3 text-rose-700"><FileText size={22} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">{period}</p><p className="mt-1 text-xs text-slate-500">Boletín de ejemplo</p></div><span className="text-xs font-semibold text-slate-400"><Download size={16} /></span></div>)}
              </div>
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Los archivos PDF reales se habilitarán cuando el módulo esté conectado a un entorno de datos de prueba autorizado.</p>
            </section>
          )}

          {section === "avisos" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Centro de notificaciones</h3><p className="mt-1 text-xs text-slate-500">Mensajes, tareas y novedades institucionales ficticias.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{unread} sin leer</span>{unread > 0 && <button onClick={() => setReadNotifications(notifications.map((item) => item.title))} className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">Marcar todas como leídas</button>}</div></div>
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar notificaciones">
                {(["Todas", "Sin leer", "Leídas"] as const).map((filter) => {
                  const count = filter === "Todas" ? notifications.length : filter === "Sin leer" ? unread : readNotifications.length;
                  return <button key={filter} type="button" aria-pressed={notificationFilter === filter} onClick={() => setNotificationFilter(filter)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${notificationFilter === filter ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{filter} <span className="ml-1 opacity-70">{count}</span></button>;
                })}
              </div>
              <div className="mt-3 divide-y divide-slate-100" aria-live="polite">
                {filteredNotifications.map((item) => {
                  const Icon = item.icon;
                  const read = readNotifications.includes(item.title);
                  return <div key={item.title} className="flex gap-3 py-4 first:pt-0 last:pb-0"><span className="mt-0.5 rounded-lg bg-violet-50 p-2.5 text-violet-700"><Icon size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-violet-700">{item.type}</span><span className="text-[10px] text-slate-400">{item.date}</span>{!read && <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />}</div><p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p><button onClick={() => setReadNotifications((current) => read ? current.filter((title) => title !== item.title) : [...current, item.title])} className="mt-2 text-xs font-semibold text-violet-700 hover:text-violet-900">{read ? "Marcar como no leída" : "Marcar como leída"}</button></div></div>;
                })}
                {filteredNotifications.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay notificaciones en este filtro.</p>}
              </div>
            </section>
          )}
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:px-6 lg:px-8">
          <span>EDUNEXA · Portal de familias</span>
          <span className="inline-flex items-center gap-1.5"><CheckCheck size={13} /> Demostración interactiva sin datos reales</span>
        </div>
      </footer>
    </main>
  );
}
