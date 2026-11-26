"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck, UserPlus, UserRoundX, Users } from "lucide-react";
import type { PlatformInstitution } from "@/components/admin/platform-superadmin-console";

type Administrator = {
  membership_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  assigned_at: string;
};

type Props = { institutions: PlatformInstitution[] };

const reasonRequired = (value: string) => value.trim().length >= 12;

export default function PlatformInstitutionAdminsPanel({ institutions }: Props) {
  const router = useRouter();
  const activeInstitutions = useMemo(() => institutions.filter((item) => item.status === "active"), [institutions]);
  const [institutionId, setInstitutionId] = useState(activeInstitutions[0]?.id ?? institutions[0]?.id ?? "");
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteReason, setInviteReason] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedInstitution = institutions.find((item) => item.id === institutionId) ?? null;

  async function loadAdministrators() {
    if (!institutionId) {
      setAdministrators([]);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/institutions/${institutionId}/administrators`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo cargar el registro de administradores.");
      setAdministrators(Array.isArray(data.administrators) ? data.administrators : []);
    } catch (error) {
      setAdministrators([]);
      setMessage(error instanceof Error ? error.message : "Error al consultar administradores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!institutionId) return;

    let cancelled = false;
    async function fetchAdministrators() {
      try {
        const response = await fetch(`/api/platform/institutions/${institutionId}/administrators`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "No se pudo cargar el registro de administradores.");
        }
        if (!cancelled) {
          setAdministrators(Array.isArray(data.administrators) ? data.administrators : []);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setAdministrators([]);
          setMessage(error instanceof Error ? error.message : "Error al consultar administradores.");
        }
      }
    }

    void fetchAdministrators();
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  async function assignAdministrator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstitution || selectedInstitution.status !== "active") {
      setMessage("Solo se pueden asignar administradores a instituciones activas.");
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId.trim())) {
      setMessage("Ingresá un UUID válido de un usuario que ya exista en Supabase Auth.");
      return;
    }
    if (!reasonRequired(reason)) {
      setMessage("El motivo debe contener al menos 12 caracteres.");
      return;
    }
    setBusy("assign");
    setMessage("");
    try {
      const response = await fetch(`/api/platform/institutions/${institutionId}/administrators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ userId: userId.trim(), reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo asignar el administrador.");
      setUserId("");
      setReason("");
      setMessage("Administrador institucional asignado y registrado en auditoría.");
      await loadAdministrators();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al asignar administrador.");
    } finally {
      setBusy("");
    }
  }

  async function inviteAdministrator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstitution || selectedInstitution.status !== "active") {
      setMessage("Solo se pueden invitar administradores a instituciones activas.");
      return;
    }
    if (!reasonRequired(inviteReason)) {
      setMessage("El motivo de la invitación debe contener al menos 12 caracteres.");
      return;
    }
    setBusy("invite"); setMessage("");
    try {
      const response = await fetch(`/api/platform/institutions/${institutionId}/administrators/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          firstName: inviteFirstName.trim(),
          lastName: inviteLastName.trim(),
          reason: inviteReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo enviar la invitación.");
      setInviteEmail(""); setInviteFirstName(""); setInviteLastName(""); setInviteReason("");
      setMessage(typeof data.message === "string" ? data.message : "Invitación enviada y pendiente de aprobación.");
      await loadAdministrators();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al invitar administrador.");
    } finally { setBusy(""); }
  }

  async function revokeAdministrator(admin: Administrator) {
    if (!window.confirm(`¿Revocar el acceso de ${admin.email || admin.user_id} a esta institución? Esta acción queda auditada.`)) return;
    const reasonText = window.prompt("Motivo de la revocación (mínimo 12 caracteres):");
    if (!reasonText || !reasonRequired(reasonText)) {
      setMessage("La revocación requiere un motivo de al menos 12 caracteres.");
      return;
    }
    setBusy(admin.membership_id);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/institutions/${institutionId}/administrators/${admin.membership_id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ reason: reasonText.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo revocar el administrador.");
      setMessage("Acceso institucional revocado y registrado en auditoría.");
      await loadAdministrators();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al revocar administrador.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-violet-200/15 bg-violet-950/15 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-violet-200">GESTIÓN DE RESPONSABLES</p>
          <h3 className="mt-1 text-lg font-bold text-white">Administradores institucionales</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Asigná o revocá responsables por institución. Cada operación requiere un motivo y queda auditada; también podés invitar por correo; la habilitación requiere aprobación institucional.</p>
        </div>
        <button type="button" onClick={() => void loadAdministrators()} disabled={!institutionId || loading || !!busy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""}/> Actualizar
        </button>
      </div>

      {institutions.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">Todavía no hay instituciones registradas.</p>
      ) : (
        <>
          <label className="block max-w-xl space-y-1.5">
            <span className="text-xs font-semibold text-slate-300">Institución</span>
            <select value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
              {institutions.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.status}</option>)}
            </select>
          </label>

          <form onSubmit={assignAdministrator} className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[1fr_1fr_auto]">
            <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="UUID del usuario existente en Supabase Auth" aria-label="UUID del usuario" className="min-w-0 rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600" required/>
            <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={12} maxLength={1000} placeholder="Motivo de asignación (mínimo 12 caracteres)" aria-label="Motivo de asignación" className="min-w-0 rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600" required/>
            <button type="submit" disabled={!!busy || !selectedInstitution || selectedInstitution.status !== "active"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-300 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
              <UserPlus size={15}/>{busy === "assign" ? "Asignando…" : "Asignar"}
            </button>
            {selectedInstitution?.status !== "active" && <p className="text-xs text-amber-200 md:col-span-3">La institución seleccionada no está activa; la asignación está deshabilitada.</p>}
          </form>

          <form onSubmit={inviteAdministrator} className="grid gap-2 rounded-xl border border-cyan-200/15 bg-cyan-950/15 p-4 md:grid-cols-2">
            <div className="md:col-span-2"><p className="text-xs font-bold text-cyan-100">Invitar nuevo administrador por correo</p><p className="mt-1 text-[11px] text-slate-400">Se crea la cuenta Auth y una membresía pendiente. El administrador del colegio debe aprobar el acceso.</p></div>
            <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Correo electrónico" aria-label="Correo del nuevo administrador" maxLength={254} required className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"/>
            <input value={inviteFirstName} onChange={(event) => setInviteFirstName(event.target.value)} placeholder="Nombre" aria-label="Nombre del administrador" minLength={2} maxLength={80} required className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"/>
            <input value={inviteLastName} onChange={(event) => setInviteLastName(event.target.value)} placeholder="Apellido" aria-label="Apellido del administrador" minLength={2} maxLength={80} required className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"/>
            <input value={inviteReason} onChange={(event) => setInviteReason(event.target.value)} placeholder="Motivo de la invitación (mínimo 12 caracteres)" aria-label="Motivo de la invitación" minLength={12} maxLength={1000} required className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 md:col-span-2"/>
            <div className="md:col-span-2"><button type="submit" disabled={!!busy || !selectedInstitution || selectedInstitution.status !== "active"} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"><UserPlus size={15}/>{busy === "invite" ? "Enviando invitación…" : "Enviar invitación"}</button></div>
          </form>

          {message && <p role="status" className="rounded-lg border border-cyan-200/20 bg-cyan-200/[0.06] px-3 py-2 text-sm text-cyan-100">{message}</p>}

          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="flex items-center justify-between gap-3 bg-white/[0.04] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-white"><Users size={16}/> Responsables registrados</span>
              <span className="text-xs text-slate-400">{administrators.filter((item) => item.status === "active").length} activos</span>
            </div>
            {loading ? <p className="p-5 text-sm text-slate-400">Cargando administradores…</p> : administrators.length === 0 ? <p className="p-5 text-sm text-slate-400">No hay administradores asignados a esta institución.</p> : (
              <div className="divide-y divide-white/[0.07]">
                {administrators.map((admin) => (
                  <div key={admin.membership_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{admin.display_name || admin.email || "Usuario sin nombre"}</p>
                      <p className="mt-1 break-all text-xs text-slate-400">{admin.email || "Correo no disponible"} · {admin.status === "active" ? "Activo" : admin.status === "invited" ? "Pendiente de aprobación" : admin.status === "suspended" ? "Suspendido" : "Inactivo"}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-600">{admin.user_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {admin.status === "active" ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200"><ShieldCheck size={12}/> Activo</span> : <span className="text-xs text-slate-500">Inactivo</span>}
                      {admin.status === "active" && <button type="button" onClick={() => void revokeAdministrator(admin)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-50"><UserRoundX size={14}/>{busy === admin.membership_id ? "Revocando…" : "Revocar"}</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
