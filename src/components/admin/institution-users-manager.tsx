"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, CheckCircle2, LoaderCircle, MailPlus, RefreshCw, ShieldCheck, UserRound, UserRoundX } from "lucide-react";
import Link from "next/link";

type Role = { key: string; name: string };
type Member = {
  director_subprofile?: string | null;
  membership_id: string; user_id: string; status: "invited" | "active" | "suspended" | "ended";
  joined_at: string | null; email: string; display_name: string; role_key: string; role_name: string;
  role_keys?: string[]; role_names?: string[];
};
type Payload = { users?: Member[]; roles?: Role[]; error?: string; message?: string };

const directorSubprofiles = [
  ["rector", "Rector"], ["vicerrector", "Vicerrector"], ["secretaria", "Secretaría"],
  ["director_proyectos", "Director de Proyectos"], ["director_deportes", "Director de Deportes"],
  ["representante_legal", "Representante Legal"], ["pedagoga", "Pedagoga"],
] as const;

const statusLabels: Record<Member["status"], string> = {
  invited: "Pendiente de aprobación", active: "Activo", suspended: "Suspendido", ended: "Finalizado",
};

export default function InstitutionUsersManager({ slug }: { slug: string }) {
  const [users, setUsers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({});
  const [draftSubprofiles, setDraftSubprofiles] = useState<Record<string, string>>({});
  const [directorSubprofile, setDirectorSubprofile] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>(["teacher"]);

  const invoke = useCallback(async (body: Record<string, string | string[]>) => {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<Payload>("manage-institution-users", { body: { ...body, slug } });
    if (error) throw new Error(error.message || "No se pudo conectar con el servicio de usuarios.");
    if (data?.error) throw new Error(data.error);
    return data ?? {};
  }, [slug]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await invoke({ action: "list" });
      setUsers(data.users ?? []);
      setRoles(data.roles ?? []);
      setDraftRoles(Object.fromEntries((data.users ?? []).map((u) => [u.membership_id, u.role_keys?.length ? u.role_keys : (u.role_key ? [u.role_key] : [])])));
      setDraftSubprofiles(Object.fromEntries((data.users ?? []).map((u) => [u.membership_id, u.director_subprofile ?? ""])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar las cuentas.");
    } finally { setLoading(false); }
  }, [invoke]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      await Promise.resolve();
      if (!cancelled) await load();
    }
    void start();
    return () => { cancelled = true; };
  }, [load]);

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy("invite"); setError(""); setNotice("");
    try {
      if (!roleKeys.length) throw new Error("Seleccioná al menos un perfil.");
      if (roleKeys.includes("director") && !directorSubprofile) throw new Error("Seleccioná el subperfil de Directivos.");
      const data = await invoke({ action: "invite", email, first_name: firstName, last_name: lastName, role_keys: roleKeys, director_subprofile: directorSubprofile });
      setNotice(data.message ?? "Invitación enviada. El acceso quedará pendiente hasta su aprobación.");
      setEmail(""); setFirstName(""); setLastName(""); setDirectorSubprofile("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar la invitación."); }
    finally { setBusy(""); }
  }

  async function changeRoles(member: Member) {
    const nextRoles = draftRoles[member.membership_id] ?? [];
    const currentRoles = member.role_keys?.length ? member.role_keys : (member.role_key ? [member.role_key] : []);
    if (!nextRoles.length) return;
    if (nextRoles.includes("director") && !draftSubprofiles[member.membership_id]) { setError("Seleccioná el subperfil de Directivos."); return; }
    if ([...nextRoles].sort().join("|") === [...currentRoles].sort().join("|") &&
        (draftSubprofiles[member.membership_id] ?? "") === (member.director_subprofile ?? "")) return;
    setBusy(member.membership_id); setError(""); setNotice("");
    try {
      await invoke({ action: "update_roles", membership_id: member.membership_id, role_keys: nextRoles, director_subprofile: nextRoles.includes("director") ? (draftSubprofiles[member.membership_id] ?? "") : "" });
      setNotice("Perfiles actualizados correctamente.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudieron actualizar los perfiles."); }
    finally { setBusy(""); }
  }

  async function approveInvitation(member: Member) {
    if (!window.confirm("¿Confirmás la habilitación de esta cuenta en esta institución?")) return;
    setBusy(member.membership_id); setError(""); setNotice("");
    try {
      await invoke({ action: "approve_invitation", membership_id: member.membership_id });
      setNotice("Invitación aprobada. El acceso institucional quedó habilitado.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo aprobar la invitación."); }
    finally { setBusy(""); }
  }

  async function changeStatus(member: Member) {
    const nextStatus = member.status === "active" ? "suspended" : "active";
    if (!window.confirm(nextStatus === "suspended"
      ? "¿Querés suspender el acceso de esta cuenta a la institución?"
      : "¿Querés reactivar el acceso de esta cuenta?")) return;
    setBusy(member.membership_id); setError(""); setNotice("");
    try {
      await invoke({ action: "set_status", membership_id: member.membership_id, status: nextStatus });
      setNotice(nextStatus === "suspended" ? "Cuenta suspendida." : "Cuenta reactivada.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cambiar el estado."); }
    finally { setBusy(""); }
  }

  return (
    <section className="member-content institution-users-page">
      <Link href={`/dashboard/${slug}`} className="back-link"><ArrowLeft size={16}/> Volver al espacio institucional</Link>
      <div className="users-heading">
        <div><span className="visual-kicker"><ShieldCheck size={14}/> ADMINISTRACIÓN INSTITUCIONAL</span><h1>Usuarios y accesos</h1><p>Invitá integrantes y administrá sus perfiles dentro de este colegio.</p></div>
        <button type="button" className="users-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Actualizar</button>
      </div>

      {error && <div className="users-alert users-alert-error" role="alert">{error}</div>}
      {notice && <div className="users-alert users-alert-success" role="status">{notice}</div>}

      <div className="users-invite-card">
        <div className="users-card-title"><div className="users-card-icon"><MailPlus size={20}/></div><div><h2>Invitar a un usuario</h2><p>La persona confirmará su correo y luego un administrador deberá aprobar el acceso institucional.</p></div></div>
        <form className="users-invite-form" onSubmit={invite}>
          <label>Nombre<input value={firstName} onChange={e=>setFirstName(e.target.value)} minLength={2} maxLength={80} required placeholder="Nombre"/></label>
          <label>Apellido<input value={lastName} onChange={e=>setLastName(e.target.value)} minLength={2} maxLength={80} required placeholder="Apellido"/></label>
          <label>Correo electrónico<input type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required placeholder="persona@institucion.edu"/></label>
          <label>Perfiles (podés seleccionar más de uno)
            <select multiple size={Math.min(roles.length, 5)} value={roleKeys}
              onChange={e=>setRoleKeys(Array.from(e.target.selectedOptions, option=>option.value))}>
              {roles.map(r=><option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </label>
          {roleKeys.includes("director") && <label>Subperfil de Directivos
            <select value={directorSubprofile} onChange={e=>setDirectorSubprofile(e.target.value)} required>
              <option value="">Seleccionar cargo</option>
              {directorSubprofiles.map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>}
          <button className="login-submit users-invite-submit" disabled={busy==="invite" || loading || roleKeys.length===0}>{busy==="invite" ? <><LoaderCircle size={16} className="animate-spin"/> Enviando...</> : <>Enviar invitación <MailPlus size={16}/></>}</button>
        </form>
        <p className="users-security-note"><ShieldCheck size={15}/> Las invitaciones se procesan en el servidor. No se muestran ni se envían contraseñas desde esta pantalla.</p>
      </div>

      <div className="users-list-card">
        <div className="users-list-heading"><div><h2>Integrantes de la institución</h2><p>{users.length} cuenta{users.length===1?"":"s"} registrada{users.length===1?"":"s"}</p></div></div>
        {loading ? <div className="users-empty"><LoaderCircle className="animate-spin" size={22}/> Cargando cuentas...</div> : users.length === 0 ? <div className="users-empty"><UserRound size={24}/> Todavía no hay integrantes para mostrar.</div> : (
          <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Persona</th><th>Perfil</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
            {users.map(member => <tr key={member.membership_id}>
              <td><div className="users-person"><span className="users-avatar"><UserRound size={17}/></span><span><strong>{member.display_name}</strong><small>{member.email}</small></span></div></td>
              <td><div className="users-role-control">
                <select multiple size={Math.min(roles.length, 4)} aria-label={`Perfiles de ${member.display_name}`}
                  value={draftRoles[member.membership_id] ?? (member.role_keys?.length ? member.role_keys : (member.role_key ? [member.role_key] : []))}
                  onChange={e=>setDraftRoles(prev=>({...prev,[member.membership_id]:Array.from(e.target.selectedOptions, option=>option.value)}))}
                  disabled={member.status!=="active" || busy===member.membership_id}>
                  {roles.map(r=><option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
                <button type="button" onClick={()=>void changeRoles(member)} disabled={member.status!=="active" || busy===member.membership_id || !(draftRoles[member.membership_id]?.length)}>Guardar</button>
                {(draftRoles[member.membership_id] ?? member.role_keys ?? [member.role_key]).includes("director") && <select aria-label={`Subperfil de ${member.display_name}`} value={draftSubprofiles[member.membership_id] ?? ""} onChange={e=>setDraftSubprofiles(prev=>({...prev,[member.membership_id]:e.target.value}))} disabled={member.status!=="active" || busy===member.membership_id}>
                  <option value="">Seleccionar subperfil</option>
                  {directorSubprofiles.map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>}
                <small>{(member.role_names ?? [member.role_name]).join(" · ")}{member.director_subprofile ? ` · ${directorSubprofiles.find(([value])=>value===member.director_subprofile)?.[1] ?? member.director_subprofile}` : ""}</small>
              </div></td>
              <td><span className={`users-status status-${member.status}`}>{statusLabels[member.status]}</span></td>
              <td>{member.status==="invited" ? <button type="button" className="users-status-action" disabled={busy===member.membership_id} onClick={()=>void approveInvitation(member)}><CheckCircle2 size={15}/> Aprobar acceso</button> : member.status==="ended" ? <span className="users-muted">Sin acceso</span> : <button type="button" className={`users-status-action ${member.status==="active"?"danger":""}`} disabled={busy===member.membership_id} onClick={()=>void changeStatus(member)}>{member.status==="active" ? <><UserRoundX size={15}/> Suspender</> : <><ShieldCheck size={15}/> Reactivar</>}</button>}</td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>
    </section>
  );
}
