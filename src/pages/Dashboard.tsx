import { useState, useEffect } from "react";
import { useNavigate }         from "react-router-dom";
import {
  LogOut, CalendarPlus, FolderOpen, User, Save,
  AlertCircle, CheckCircle2, Pencil, Shield, Users,
  Check, X, ChevronDown, ChevronUp, CalendarClock, ExternalLink,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import SessionModal from "@/components/portal/SessionModal";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EmpresaUsuario {
  role:              string;
  can_book_sessions: boolean;
  can_view_projects: boolean;
  can_view_sessions: boolean;
  can_edit_company:  boolean;
}

interface EmpresaUsuarioRow {
  id:                string;
  user_id:           string;
  correo_usuario:    string;
  role:              string;
  status:            string;
  can_book_sessions: boolean;
  can_view_projects: boolean;
  can_view_sessions: boolean;
  can_edit_company:  boolean;
}

interface Cliente {
  id:         string;
  empresa:    string;
  nit_cedula: string;
  correo:     string;
  telefono:   string;
}

interface Proyecto {
  id:          string;
  nombre:      string;
  descripcion: string | null;
  estado:      string;
}

interface Sesion {
  id:          string;
  tipo_sesion: string;
  motivo:      string | null;
  fecha_inicio: string;
  fecha_fin:    string;
  meet_link:    string | null;
  estado:       string;
  proyecto:     { nombre: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner:    "Owner",
  manager:  "Manager",
  analista: "Analista",
  viewer:   "Viewer",
};

// ─── Componente ───────────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();

  const [eu,            setEu]            = useState<EmpresaUsuario | null>(null);
  const [cliente,       setCliente]       = useState<Cliente | null>(null);
  const [proyectos,     setProyectos]     = useState<Proyecto[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<"proyectos" | "sesiones" | "usuarios" | "perfil">("proyectos");
  const [sesiones,      setSesiones]      = useState<Sesion[]>([]);
  const [sessionModal,  setSessionModal]  = useState<{ open: boolean; proyecto: Proyecto | null }>({
    open: false, proyecto: null,
  });

  // Perfil editable
  const [editMode,      setEditMode]      = useState(false);
  const [profileForm,   setProfileForm]   = useState({ empresa: "", telefono: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Gestión de usuarios (owner)
  const [usuarios,      setUsuarios]      = useState<EmpresaUsuarioRow[]>([]);
  const [expandedUser,  setExpandedUser]  = useState<string | null>(null);
  const [savingUser,    setSavingUser]    = useState<string | null>(null);

  // ── Cargar datos ────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/portal"); return; }

      // Obtener empresa_usuario con permisos
      const { data: euData } = await supabase
        .from("empresa_usuarios")
        .select("role, can_book_sessions, can_view_projects, can_view_sessions, can_edit_company, cliente_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!euData) { navigate("/portal"); return; }
      setEu(euData);

      // Obtener datos de la empresa
      const { data: cl } = await supabase
        .from("clientes")
        .select("id, empresa, nit_cedula, correo, telefono")
        .eq("id", euData.cliente_id)
        .maybeSingle();

      if (!cl) { navigate("/portal"); return; }
      setCliente(cl);
      setProfileForm({ empresa: cl.empresa, telefono: cl.telefono });

      // Proyectos (solo si tiene permiso)
      if (euData.can_view_projects) {
        const { data: proy } = await supabase
          .from("proyectos")
          .select("id, nombre, descripcion, estado")
          .eq("cliente_id", cl.id)
          .eq("estado", "activo")
          .order("created_at", { ascending: false });
        setProyectos(proy ?? []);
      }

      // Sesiones (solo si tiene permiso)
      if (euData.can_view_sessions) {
        const { data: sess } = await supabase
          .from("sesiones_proyecto")
          .select("id, tipo_sesion, motivo, fecha_inicio, fecha_fin, meet_link, estado, proyecto:proyectos(nombre)")
          .order("fecha_inicio", { ascending: false });
        setSesiones((sess as Sesion[]) ?? []);
      }

      // Usuarios de la empresa (solo owner/manager)
      if (euData.role === "owner" || euData.role === "manager") {
        const { data: usrs } = await supabase
          .from("empresa_usuarios")
          .select("id, user_id, correo_usuario, role, status, can_book_sessions, can_view_projects, can_view_sessions, can_edit_company")
          .eq("cliente_id", cl.id)
          .order("created_at", { ascending: true });
        setUsuarios(usrs ?? []);
      }

      setLoading(false);
    };
    load();
  }, [navigate]);

  // ── Logout ──────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal");
  };

  // ── Guardar perfil ──────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!cliente) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const { error } = await supabase
        .from("clientes")
        .update({
          empresa:    profileForm.empresa,
          telefono:   profileForm.telefono,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cliente.id);

      if (error) throw error;
      setCliente((prev) => prev ? { ...prev, empresa: profileForm.empresa, telefono: profileForm.telefono } : prev);
      setProfileMsg({ type: "ok", text: "Información actualizada correctamente." });
      setEditMode(false);
    } catch {
      setProfileMsg({ type: "err", text: "Error al guardar. Intenta de nuevo." });
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Gestión de usuarios ─────────────────────────────────────────────────────

  const updateUsuario = async (id: string, changes: Partial<EmpresaUsuarioRow>) => {
    setSavingUser(id);
    const { error } = await supabase
      .from("empresa_usuarios")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setUsuarios((prev) => prev.map((u) => u.id === id ? { ...u, ...changes } : u));
    }
    setSavingUser(null);
  };

  const aprobarUsuario = (id: string) =>
    updateUsuario(id, { status: "active" });

  const rechazarUsuario = (id: string) =>
    updateUsuario(id, { status: "disabled" });

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Cargando…</div>
      </div>
    );
  }

  const pendingCount = usuarios.filter((u) => u.status === "pending").length;

  const tabs = [
    ...(eu?.can_view_projects  ? [{ key: "proyectos" as const, label: "Mis proyectos", icon: FolderOpen,    badge: 0 }] : []),
    ...(eu?.can_view_sessions  ? [{ key: "sesiones"  as const, label: "Sesiones",      icon: CalendarClock, badge: 0 }] : []),
    ...((eu?.role === "owner" || eu?.role === "manager") ? [{ key: "usuarios" as const, label: "Usuarios", icon: Users, badge: pendingCount }] : []),
    { key: "perfil" as const, label: "Mi perfil", icon: User, badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo-visionbi.png"
              alt="VisionBI"
              className="h-9 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="hidden sm:flex flex-col">
              <span className="text-sm font-semibold text-[#1a3461] leading-tight">{cliente?.empresa}</span>
              {eu && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {ROLE_LABELS[eu.role] ?? eu.role}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-600 gap-2"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </Button>
        </div>
      </header>

      {/* Nav tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-[#1a3461] text-[#1a3461]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
              {badge > 0 && (
                <span className="bg-orange-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center leading-none">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Proyectos ── */}
        {activeTab === "proyectos" && eu?.can_view_projects && (
          <div>
            <h2 className="text-lg font-bold text-[#1a3461] mb-6">Proyectos activos</h2>

            {proyectos.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No hay proyectos activos</p>
                <p className="text-slate-400 text-sm mt-1">Contacta a VisionBI para iniciar un proyecto.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {proyectos.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 hover:border-[#00b8d9] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-semibold text-[#1a3461]">{p.nombre}</h3>
                        {p.descripcion && (
                          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{p.descripcion}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">
                        Activo
                      </span>
                    </div>
                    {eu?.can_book_sessions ? (
                      <Button
                        size="sm"
                        className="w-full bg-[#1a3461] hover:bg-[#15294f] text-white gap-2 mt-1"
                        onClick={() => setSessionModal({ open: true, proyecto: p })}
                      >
                        <CalendarPlus className="h-4 w-4" /> Agendar sesión
                      </Button>
                    ) : (
                      <p className="text-xs text-slate-400 text-center mt-2">Sin permiso para reservar sesiones</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Sesiones ── */}
        {activeTab === "sesiones" && eu?.can_view_sessions && (
          <div>
            <h2 className="text-lg font-bold text-[#1a3461] mb-6">Sesiones agendadas</h2>

            {sesiones.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <CalendarClock className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No hay sesiones registradas</p>
                <p className="text-slate-400 text-sm mt-1">Las sesiones agendadas aparecerán aquí.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sesiones.map((s) => {
                  const inicio  = new Date(s.fecha_inicio);
                  const fin     = new Date(s.fecha_fin);
                  const now     = new Date();
                  const isPast  = fin < now;
                  const isToday = inicio.toDateString() === now.toDateString();

                  return (
                    <div
                      key={s.id}
                      className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
                        isPast ? "border-slate-100 opacity-70" : isToday ? "border-[#00b8d9]" : "border-slate-200"
                      }`}
                    >
                      {/* Fecha */}
                      <div className="shrink-0 text-center bg-slate-50 rounded-lg px-4 py-3 min-w-[80px]">
                        <p className="text-xs text-slate-400 uppercase font-medium">
                          {inicio.toLocaleDateString("es-CO", { month: "short" })}
                        </p>
                        <p className="text-2xl font-bold text-[#1a3461] leading-tight">
                          {inicio.getDate()}
                        </p>
                        <p className="text-xs text-slate-500">
                          {inicio.toLocaleDateString("es-CO", { year: "numeric" })}
                        </p>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">{s.tipo_sesion}</p>
                          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                            s.estado === "confirmada"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : s.estado === "cancelada"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {s.estado}
                          </span>
                          {isToday && (
                            <span className="text-xs font-medium bg-[#00b8d9]/10 text-[#00b8d9] border border-[#00b8d9]/30 rounded-full px-2 py-0.5">
                              Hoy
                            </span>
                          )}
                        </div>
                        {s.proyecto && (
                          <p className="text-xs text-slate-400 mt-0.5">{s.proyecto.nombre}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          {inicio.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                          {" – "}
                          {fin.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {s.motivo && (
                          <p className="text-xs text-slate-500 mt-1 truncate">{s.motivo}</p>
                        )}
                      </div>

                      {/* Meet link */}
                      {s.meet_link && !isPast && (
                        <a
                          href={s.meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-[#00b8d9] hover:text-[#0099b8] border border-[#00b8d9]/40 rounded-lg px-3 py-2 hover:bg-[#00b8d9]/5 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Unirse
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Usuarios ── */}
        {activeTab === "usuarios" && (eu?.role === "owner" || eu?.role === "manager") && (
          <div>
            <h2 className="text-lg font-bold text-[#1a3461] mb-6">Usuarios de la empresa</h2>

            {/* Pendientes */}
            {usuarios.filter((u) => u.status === "pending").length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-orange-600 uppercase tracking-wide mb-3">
                  Solicitudes pendientes
                </h3>
                <div className="space-y-3">
                  {usuarios.filter((u) => u.status === "pending").map((u) => (
                    <div key={u.id} className="bg-white rounded-xl border border-orange-200 p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{u.correo_usuario}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Solicita acceso como {ROLE_LABELS[u.role] ?? u.role}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white gap-1.5 h-8"
                          disabled={savingUser === u.id}
                          onClick={() => aprobarUsuario(u.id)}
                        >
                          <Check className="h-3.5 w-3.5" /> Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5 h-8"
                          disabled={savingUser === u.id}
                          onClick={() => rechazarUsuario(u.id)}
                        >
                          <X className="h-3.5 w-3.5" /> Rechazar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activos */}
            <div>
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Usuarios activos
              </h3>
              <div className="space-y-2">
                {usuarios.filter((u) => u.status === "active").map((u) => (
                  <div key={u.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{u.correo_usuario}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{ROLE_LABELS[u.role] ?? u.role}</p>
                      </div>
                      {expandedUser === u.id
                        ? <ChevronUp className="h-4 w-4 text-slate-400" />
                        : <ChevronDown className="h-4 w-4 text-slate-400" />
                      }
                    </button>

                    {expandedUser === u.id && (
                      <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
                        {/* Rol */}
                        <div>
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Rol</Label>
                          <select
                            value={u.role}
                            onChange={(e) => updateUsuario(u.id, { role: e.target.value })}
                            disabled={savingUser === u.id}
                            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white w-full max-w-xs"
                          >
                            <option value="owner">Owner</option>
                            <option value="manager">Manager</option>
                            <option value="analista">Analista</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>

                        {/* Permisos */}
                        <div>
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Permisos</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              ["can_book_sessions", "Reservar sesiones"],
                              ["can_view_projects", "Ver proyectos"],
                              ["can_view_sessions", "Ver sesiones"],
                              ["can_edit_company",  "Editar empresa"],
                            ] as [keyof EmpresaUsuarioRow, string][]).map(([key, label]) => (
                              <label key={key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!u[key]}
                                  disabled={savingUser === u.id}
                                  onChange={(e) => updateUsuario(u.id, { [key]: e.target.checked })}
                                  className="rounded"
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Deshabilitar */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          disabled={savingUser === u.id}
                          onClick={() => updateUsuario(u.id, { status: "disabled" })}
                        >
                          Deshabilitar usuario
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                {usuarios.filter((u) => u.status === "active").length === 0 && (
                  <p className="text-sm text-slate-400 py-4 text-center">No hay usuarios activos.</p>
                )}
              </div>
            </div>

            {/* Deshabilitados */}
            {usuarios.filter((u) => u.status === "disabled").length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Deshabilitados</h3>
                <div className="space-y-2">
                  {usuarios.filter((u) => u.status === "disabled").map((u) => (
                    <div key={u.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between gap-4 opacity-60">
                      <div>
                        <p className="text-sm font-medium text-slate-600">{u.correo_usuario}</p>
                        <p className="text-xs text-slate-400">{ROLE_LABELS[u.role] ?? u.role}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={savingUser === u.id}
                        onClick={() => aprobarUsuario(u.id)}
                      >
                        Reactivar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Perfil ── */}
        {activeTab === "perfil" && cliente && (
          <div className="max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#1a3461]">Mi información</h2>
              {!editMode && eu?.can_edit_company && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[#1a3461] text-[#1a3461]"
                  onClick={() => { setEditMode(true); setProfileMsg(null); }}
                >
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              )}
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 text-sm rounded-lg p-3 mb-5 ${
                profileMsg.type === "ok"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {profileMsg.type === "ok"
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  : <AlertCircle  className="h-4 w-4 flex-shrink-0" />
                }
                {profileMsg.text}
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Empresa</Label>
                {editMode ? (
                  <Input
                    value={profileForm.empresa}
                    onChange={(e) => setProfileForm((f) => ({ ...f, empresa: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-800">{cliente.empresa}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">NIT / Cédula</Label>
                <p className="text-sm font-medium text-slate-800">{cliente.nit_cedula}</p>
                <p className="text-xs text-slate-400">No modificable.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Correo de contacto</Label>
                <p className="text-sm font-medium text-slate-800">{cliente.correo}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Teléfono</Label>
                {editMode ? (
                  <Input
                    value={profileForm.telefono}
                    onChange={(e) => setProfileForm((f) => ({ ...f, telefono: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-800">{cliente.telefono}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tu rol</Label>
                <p className="text-sm font-medium text-slate-800">{ROLE_LABELS[eu?.role ?? ""] ?? eu?.role}</p>
              </div>

              {editMode && (
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setEditMode(false);
                      setProfileForm({ empresa: cliente.empresa, telefono: cliente.telefono });
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-[#1a3461] hover:bg-[#15294f] text-white gap-2"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                  >
                    <Save className="h-4 w-4" />
                    {savingProfile ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal de sesión */}
      {sessionModal.proyecto && (
        <SessionModal
          open={sessionModal.open}
          onClose={() => setSessionModal({ open: false, proyecto: null })}
          proyectoId={sessionModal.proyecto.id}
          projectName={sessionModal.proyecto.nombre}
        />
      )}
    </div>
  );
};

export default Dashboard;
