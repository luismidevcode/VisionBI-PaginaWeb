import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LogOut, CalendarDays, Users, FolderKanban,
  Plus, Pencil, Video, ExternalLink, Clock,
  Building2, Phone, Mail, Hash, UserCheck, UserX,
  Shield, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  TicketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import ClienteModal, { type ClienteRow } from "@/components/admin/ClienteModal";
import ProyectoModal, { type ProyectoRow } from "@/components/admin/ProyectoModal";
import { TicketModal, type Ticket, type Miembro } from "@/components/tickets/TicketModal";
import { ESTADO_LABELS, PRIORIDAD_LABELS, ESTADO_COLOR, PRIORIDAD_COLOR } from "@/lib/ticketStateMachine";

// ─── Constantes ───────────────────────────────────────────────────────────────

const ADMIN_EMAILS = ["luis.visionbi@gmail.com", "luismiguelbotero2327@gmail.com"];

const ROLE_OPTIONS = ["owner", "manager", "analista", "viewer"] as const;
type Role = typeof ROLE_OPTIONS[number];

const ROLE_LABELS: Record<Role, string> = {
  owner:    "Owner",
  manager:  "Manager",
  analista: "Analista",
  viewer:   "Viewer",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EmpresaUsuarioRow {
  id:                string;
  cliente_id:        string;
  user_id:           string;
  correo_usuario:    string;
  role:              Role;
  can_book_sessions: boolean;
  can_view_projects: boolean;
  can_view_sessions: boolean;
  can_edit_company:  boolean;
  status:            "pending" | "active" | "disabled";
  created_at:        string;
  clientes:          { empresa: string } | null;
}

interface AgendamientoRow {
  id: string;
  tipo_encuentro: string;
  motivo: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  clientes: { empresa: string; correo: string } | null;
}

interface SesionRow {
  id: string;
  tipo_sesion: string;
  motivo: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  meet_link: string | null;
  estado: string;
  proyectos: { nombre: string; clientes: { empresa: string } | null } | null;
}

interface AgendaItem {
  id: string;
  tipo: "diagnostico" | "sesion";
  tipoLabel: string;
  cliente: string;
  proyecto?: string;
  fechaInicio: Date;
  fechaFin: Date;
  meetLink?: string;
  motivo?: string;
  estado: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtFecha(d: Date) {
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}
function fmtHora(d: Date) {
  return format(d, "h:mm a");
}

function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    confirmado:  "bg-green-50  text-green-700  border-green-200",
    confirmada:  "bg-green-50  text-green-700  border-green-200",
    activo:      "bg-green-50  text-green-700  border-green-200",
    inactivo:    "bg-slate-50  text-slate-600  border-slate-200",
    completado:  "bg-blue-50   text-blue-700   border-blue-200",
    cancelado:   "bg-red-50    text-red-700    border-red-200",
  };
  return map[estado] ?? "bg-slate-50 text-slate-600 border-slate-200";
}

// ─── Componente ───────────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<"agenda" | "clientes" | "proyectos" | "usuarios" | "tickets">("agenda");
  const [showAll,     setShowAll]     = useState(false);

  const [agendaItems,   setAgendaItems]   = useState<AgendaItem[]>([]);
  const [clientes,      setClientes]      = useState<ClienteRow[]>([]);
  const [proyectos,     setProyectos]     = useState<ProyectoRow[]>([]);
  const [usuarios,      setUsuarios]      = useState<EmpresaUsuarioRow[]>([]);
  const [expandedUser,  setExpandedUser]  = useState<string | null>(null);
  const [savingUser,    setSavingUser]    = useState<string | null>(null);

  // Tickets
  const [adminTickets,   setAdminTickets]   = useState<(Ticket & { empresa?: string })[]>([]);
  const [adminTeam,      setAdminTeam]      = useState<Miembro[]>([]);
  const [ticketModal,    setTicketModal]    = useState<{ open: boolean; ticketId?: string }>({ open: false });
  const [ticketEstado,   setTicketEstado]   = useState("todos");
  const [ticketCliente,  setTicketCliente]  = useState("todos");
  const [adminUserId,    setAdminUserId]    = useState("");

  const [clienteModal,  setClienteModal]  = useState<{ open: boolean; cliente: ClienteRow | null }>({ open: false, cliente: null });
  const [proyectoModal, setProyectoModal] = useState<{ open: boolean; proyecto: ProyectoRow | null }>({ open: false, proyecto: null });

  // ── Cargar datos ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !ADMIN_EMAILS.includes(session.user.email ?? "")) {
      navigate("/admin");
      return;
    }

    setAdminUserId(session.user.id);

    const [agRes, sesRes, clRes, prRes, usRes, txRes, teamRes] = await Promise.all([
      supabase.from("agendamientos").select("*, clientes(empresa, correo)").order("fecha_inicio"),
      supabase.from("sesiones_proyecto").select("*, proyectos(nombre, clientes(empresa))").order("fecha_inicio"),
      supabase.from("clientes").select("*").order("empresa"),
      supabase.from("proyectos").select("*, clientes(empresa)").order("nombre"),
      supabase.from("empresa_usuarios").select("*, clientes(empresa)").order("created_at", { ascending: false }),
      supabase.from("tickets").select("*, proyecto:proyectos(nombre, clientes(empresa))").order("created_at", { ascending: false }),
      supabase.rpc("list_admin_users"),
    ]);

    const agItems: AgendaItem[] = (agRes.data as AgendamientoRow[] ?? []).map((a) => ({
      id:         a.id,
      tipo:       "diagnostico",
      tipoLabel:  a.tipo_encuentro,
      cliente:    a.clientes?.empresa ?? "—",
      fechaInicio: new Date(a.fecha_inicio),
      fechaFin:    new Date(a.fecha_fin),
      motivo:     a.motivo ?? undefined,
      estado:     a.estado,
    }));

    const sesItems: AgendaItem[] = (sesRes.data as SesionRow[] ?? []).map((s) => ({
      id:         s.id,
      tipo:       "sesion",
      tipoLabel:  s.tipo_sesion,
      cliente:    s.proyectos?.clientes?.empresa ?? "—",
      proyecto:   s.proyectos?.nombre ?? "—",
      fechaInicio: new Date(s.fecha_inicio),
      fechaFin:    new Date(s.fecha_fin),
      meetLink:   s.meet_link ?? undefined,
      motivo:     s.motivo ?? undefined,
      estado:     s.estado,
    }));

    const combined = [...agItems, ...sesItems].sort(
      (a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime()
    );

    setAgendaItems(combined);
    setClientes((clRes.data as ClienteRow[]) ?? []);
    setProyectos((prRes.data as ProyectoRow[]) ?? []);
    setUsuarios((usRes.data as EmpresaUsuarioRow[]) ?? []);

    // Tickets: add empresa name from nested join
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawTickets = (txRes.data ?? []) as any[];
    setAdminTickets(rawTickets.map((t) => ({
      ...t,
      empresa: t.proyecto?.clientes?.empresa ?? "—",
    })));
    setAdminTeam(((teamRes.data ?? []) as { user_id: string; correo_usuario: string }[]).map((u) => ({
      user_id:        u.user_id,
      correo_usuario: u.correo_usuario,
      role:           "admin",
    })));

    setLoading(false);
  }, [navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };

  // ── Gestión de usuarios ──────────────────────────────────────────────────────

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

  const aprobarUsuario = (u: EmpresaUsuarioRow) =>
    updateUsuario(u.id, { status: "active" });

  const rechazarUsuario = (u: EmpresaUsuarioRow) =>
    updateUsuario(u.id, { status: "disabled" });

  // ── Filtro agenda ────────────────────────────────────────────────────────────

  const now    = new Date();
  const visibles = showAll
    ? agendaItems
    : agendaItems.filter((i) => i.fechaFin >= now);

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 animate-pulse text-sm">Cargando…</p>
      </div>
    );
  }

  const pendingCount = usuarios.filter((u) => u.status === "pending").length;

  const unassignedCount = adminTickets.filter((t) => !t.asignado_id && t.estado !== "cerrado").length;

  const tabs = [
    { key: "agenda",    label: "Agenda",    icon: CalendarDays,  badge: 0 },
    { key: "clientes",  label: "Clientes",  icon: Users,         badge: 0 },
    { key: "proyectos", label: "Proyectos", icon: FolderKanban,  badge: 0 },
    { key: "usuarios",  label: "Usuarios",  icon: Shield,        badge: pendingCount },
    { key: "tickets",   label: "Tickets",   icon: TicketIcon,    badge: unassignedCount },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-[#1a3461] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-15 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo-visionbi.png"
              alt="VisionBI"
              className="h-8 object-contain brightness-0 invert"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="text-white font-semibold text-sm hidden sm:block">
              Panel Administrativo
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-300 hover:text-white hover:bg-white/10 gap-2"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {tabs.map(({ key, label, icon: Icon, ...rest }) => {
            const badge = "badge" in rest ? (rest as { badge: number }).badge : 0;
            return (
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
                  <span className="ml-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* ── Agenda ── */}
        {activeTab === "agenda" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#1a3461]">
                Agenda — {visibles.length} evento{visibles.length !== 1 ? "s" : ""}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAll((v) => !v)}
                className="text-slate-600"
              >
                {showAll ? "Ver próximos" : "Ver todos"}
              </Button>
            </div>

            {visibles.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <CalendarDays className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No hay eventos {showAll ? "" : "próximos"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibles.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    {/* Tipo badge */}
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        item.tipo === "diagnostico"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-[#1a3461]/5 text-[#1a3461] border-[#1a3461]/20"
                      }`}>
                        {item.tipo === "diagnostico" ? "Diagnóstico" : "Sesión"}
                      </span>
                    </div>

                    {/* Fecha / hora */}
                    <div className="flex-shrink-0 min-w-[160px]">
                      <p className="text-sm font-semibold text-slate-800 capitalize">
                        {fmtFecha(item.fechaInicio)}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {fmtHora(item.fechaInicio)} – {fmtHora(item.fechaFin)}
                      </p>
                    </div>

                    {/* Cliente / tipo */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a3461] truncate">{item.cliente}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {item.tipoLabel}
                        {item.proyecto && ` · ${item.proyecto}`}
                      </p>
                      {item.motivo && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{item.motivo}</p>
                      )}
                    </div>

                    {/* Estado + Meet */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${estadoBadge(item.estado)}`}>
                        {item.estado}
                      </span>
                      {item.meetLink && (
                        <a
                          href={item.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#1a3461] hover:underline"
                        >
                          <Video className="h-3.5 w-3.5" /> Meet
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Clientes ── */}
        {activeTab === "clientes" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#1a3461]">
                Clientes — {clientes.length}
              </h2>
              <Button
                size="sm"
                className="bg-[#1a3461] hover:bg-[#15294f] text-white gap-2"
                onClick={() => setClienteModal({ open: true, cliente: null })}
              >
                <Plus className="h-4 w-4" /> Nuevo cliente
              </Button>
            </div>

            {clientes.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin clientes registrados</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {["Empresa", "NIT / Cédula", "Correo", "Teléfono", "Colaboradores", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {clientes.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-semibold text-[#1a3461] flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            {c.empresa}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Hash className="h-3 w-3 text-slate-400" />{c.nit_cedula}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <a href={`mailto:${c.correo}`} className="flex items-center gap-1.5 hover:text-[#1a3461]">
                              <Mail className="h-3 w-3 text-slate-400" />{c.correo}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3 text-slate-400" />{c.telefono}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{c.num_colaboradores ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-slate-500 hover:text-[#1a3461]"
                              onClick={() => setClienteModal({ open: true, cliente: c })}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Proyectos ── */}
        {activeTab === "proyectos" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#1a3461]">
                Proyectos — {proyectos.length}
              </h2>
              <Button
                size="sm"
                className="bg-[#1a3461] hover:bg-[#15294f] text-white gap-2"
                onClick={() => setProyectoModal({ open: true, proyecto: null })}
              >
                <Plus className="h-4 w-4" /> Nuevo proyecto
              </Button>
            </div>

            {proyectos.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <FolderKanban className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin proyectos registrados</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {["Proyecto", "Cliente", "Estado", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {proyectos.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#1a3461]">{p.nombre}</p>
                            {p.descripcion && (
                              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{p.descripcion}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{p.clientes?.empresa ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${estadoBadge(p.estado)}`}>
                              {p.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-slate-500 hover:text-[#1a3461]"
                              onClick={() => setProyectoModal({ open: true, proyecto: p })}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ── Usuarios ── */}
        {activeTab === "usuarios" && (() => {
          const pending  = usuarios.filter((u) => u.status === "pending");
          const active   = usuarios.filter((u) => u.status === "active");
          const disabled = usuarios.filter((u) => u.status === "disabled");

          const MODULE_KEYS = [
            { key: "can_view_projects",  label: "Ver proyectos" },
            { key: "can_view_sessions",  label: "Ver sesiones" },
            { key: "can_book_sessions",  label: "Reservar sesiones" },
            { key: "can_edit_company",   label: "Editar empresa" },
          ] as const;

          const UserRow = ({ u }: { u: EmpresaUsuarioRow }) => {
            const isExpanded = expandedUser === u.id;
            const isSaving   = savingUser === u.id;
            return (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-white cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{u.correo_usuario}</p>
                    <p className="text-xs text-slate-400">{u.clientes?.empresa ?? "—"}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    u.role === "owner"    ? "bg-purple-50 text-purple-700 border-purple-200" :
                    u.role === "manager"  ? "bg-blue-50 text-blue-700 border-blue-200" :
                    u.role === "analista" ? "bg-cyan-50 text-cyan-700 border-cyan-200" :
                                           "bg-slate-50 text-slate-600 border-slate-200"
                  }`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
                    {/* Rol */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500 w-24">Rol</span>
                      <select
                        value={u.role}
                        disabled={isSaving}
                        onChange={(e) => updateUsuario(u.id, { role: e.target.value as Role })}
                        className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Módulos */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500">Módulos</p>
                      {MODULE_KEYS.map(({ key, label }) => {
                        const val = u[key] as boolean;
                        return (
                          <button
                            key={key}
                            disabled={isSaving}
                            onClick={() => updateUsuario(u.id, { [key]: !val })}
                            className="flex items-center gap-2 w-full text-left text-sm text-slate-700 hover:text-[#1a3461]"
                          >
                            {val
                              ? <ToggleRight className="h-5 w-5 text-green-500 flex-shrink-0" />
                              : <ToggleLeft  className="h-5 w-5 text-slate-300 flex-shrink-0" />
                            }
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Estado */}
                    {u.status !== "disabled" && (
                      <button
                        disabled={isSaving}
                        onClick={() => rechazarUsuario(u)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Deshabilitar usuario
                      </button>
                    )}
                    {u.status === "disabled" && (
                      <button
                        disabled={isSaving}
                        onClick={() => aprobarUsuario(u)}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Rehabilitar usuario
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          };

          return (
            <div className="space-y-8">
              {/* Pendientes */}
              {pending.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold text-[#1a3461] mb-4 flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-amber-500" />
                    Pendientes de aprobación — {pending.length}
                  </h2>
                  <div className="space-y-2">
                    {pending.map((u) => (
                      <div key={u.id} className="bg-white rounded-xl border border-amber-200 p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{u.correo_usuario}</p>
                          <p className="text-xs text-slate-400">{u.clientes?.empresa ?? "—"}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={savingUser === u.id}
                            className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                            onClick={() => aprobarUsuario(u)}
                          >
                            <UserCheck className="h-3.5 w-3.5" /> Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingUser === u.id}
                            className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                            onClick={() => rechazarUsuario(u)}
                          >
                            <UserX className="h-3.5 w-3.5" /> Rechazar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activos */}
              <div>
                <h2 className="text-lg font-bold text-[#1a3461] mb-4">
                  Usuarios activos — {active.length}
                </h2>
                {active.length === 0 ? (
                  <p className="text-slate-400 text-sm">Sin usuarios activos.</p>
                ) : (
                  <div className="space-y-2">
                    {active.map((u) => <UserRow key={u.id} u={u} />)}
                  </div>
                )}
              </div>

              {/* Deshabilitados */}
              {disabled.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-slate-400 mb-3">
                    Deshabilitados — {disabled.length}
                  </h2>
                  <div className="space-y-2 opacity-60">
                    {disabled.map((u) => <UserRow key={u.id} u={u} />)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Tickets ── */}
        {activeTab === "tickets" && (() => {
          const clienteOptions = Array.from(new Set(adminTickets.map((t) => t.empresa).filter(Boolean)));
          const filtered = adminTickets.filter((t) => {
            if (ticketEstado  !== "todos" && t.estado  !== ticketEstado)  return false;
            if (ticketCliente !== "todos" && t.empresa !== ticketCliente) return false;
            return true;
          });

          const byEstado = { abierto: 0, en_progreso: 0, resuelto: 0, cerrado: 0 } as Record<string, number>;
          adminTickets.forEach((t) => { byEstado[t.estado] = (byEstado[t.estado] ?? 0) + 1; });

          const criticas = adminTickets.filter((t) => t.prioridad === "critica" && t.estado !== "cerrado").length;
          const conResolucion = adminTickets.filter((t) => t.resolved_at);
          const avgHoras = conResolucion.length > 0
            ? Math.round(conResolucion.reduce(
                (sum, t) => sum + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0
              ) / conResolucion.length / 3600000)
            : null;

          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1a3461]">
                  Tickets — {filtered.length}
                  {unassignedCount > 0 && (
                    <span className="ml-2 text-sm font-normal text-orange-600">
                      ({unassignedCount} sin asignar)
                    </span>
                  )}
                </h2>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                {[
                  { label: "Total",       value: adminTickets.length,       color: "text-slate-700" },
                  { label: "Abiertos",    value: byEstado.abierto ?? 0,     color: "text-yellow-600" },
                  { label: "En progreso", value: byEstado.en_progreso ?? 0, color: "text-blue-600" },
                  { label: "Resueltos",   value: byEstado.resuelto ?? 0,    color: "text-green-600" },
                  { label: "Cerrados",    value: byEstado.cerrado ?? 0,     color: "text-slate-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mb-5">
                {criticas > 0 && (
                  <div className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5">
                    <span className="font-bold">{criticas}</span> ticket{criticas !== 1 ? "s" : ""} crítico{criticas !== 1 ? "s" : ""} abierto{criticas !== 1 ? "s" : ""}
                  </div>
                )}
                {avgHoras !== null && (
                  <div className="flex items-center gap-2 text-sm bg-white border border-slate-200 text-slate-600 rounded-xl px-4 py-2.5">
                    <Clock className="h-4 w-4 text-slate-400" />
                    Tiempo promedio de resolución: <strong className="text-slate-700">{avgHoras}h</strong>
                  </div>
                )}
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-3 mb-5">
                <select
                  value={ticketEstado}
                  onChange={(e) => setTicketEstado(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="todos">Todos los estados</option>
                  {(["abierto","en_progreso","resuelto","cerrado"] as const).map((s) => (
                    <option key={s} value={s}>{ESTADO_LABELS[s]}</option>
                  ))}
                </select>
                <select
                  value={ticketCliente}
                  onChange={(e) => setTicketCliente(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="todos">Todos los clientes</option>
                  {clienteOptions.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                  <TicketIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No hay tickets</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {["Código", "Cliente", "Proyecto", "Título", "Prioridad", "Estado", "Fecha", "Asignado", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono whitespace-nowrap">{t.codigo}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{t.empresa}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{t.proyecto?.nombre ?? "—"}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setTicketModal({ open: true, ticketId: t.id })}
                              className="text-sm font-medium text-[#1a3461] hover:underline text-left"
                            >
                              {t.titulo}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORIDAD_COLOR[t.prioridad]}`}>
                              {PRIORIDAD_LABELS[t.prioridad]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_COLOR[t.estado]}`}>
                              {ESTADO_LABELS[t.estado]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                            {new Date(t.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                            {" "}
                            {new Date(t.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={t.asignado_id ?? ""}
                              onChange={async (e) => {
                                const asignado_id = e.target.value;
                                if (!asignado_id) return;
                                await supabase.functions.invoke("ticket-action", {
                                  body: { action: "assign", ticket_id: t.id, asignado_id },
                                });
                                setAdminTickets((prev) =>
                                  prev.map((x) => x.id === t.id ? { ...x, asignado_id } : x)
                                );
                              }}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white max-w-[160px]"
                            >
                              <option value="">Sin asignar</option>
                              {adminTeam.map((m) => (
                                <option key={m.user_id} value={m.user_id}>{m.correo_usuario}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setTicketModal({ open: true, ticketId: t.id })}
                              className="text-xs text-slate-400 hover:text-[#1a3461]"
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

      </main>

      {/* Modal tickets admin */}
      <TicketModal
        open={ticketModal.open}
        ticketId={ticketModal.ticketId}
        onClose={() => setTicketModal({ open: false })}
        onCreated={() => loadData()}
        onUpdated={(t) => setAdminTickets((prev) => prev.map((x) => x.id === t.id ? { ...x, ...t } : x))}
        miembros={adminTeam}
        proyectos={[]}
        myUserId={adminUserId}
        esAdmin={true}
        allowAssign={true}
      />

      {/* Modales */}
      <ClienteModal
        open={clienteModal.open}
        onClose={() => setClienteModal({ open: false, cliente: null })}
        cliente={clienteModal.cliente}
        onSaved={loadData}
      />
      <ProyectoModal
        open={proyectoModal.open}
        onClose={() => setProyectoModal({ open: false, proyecto: null })}
        proyecto={proyectoModal.proyecto}
        clientes={clientes}
        onSaved={loadData}
      />
    </div>
  );
};

export default AdminDashboard;
