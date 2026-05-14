import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LogOut, CalendarDays, Users, FolderKanban,
  Plus, Pencil, Video, ExternalLink, Clock,
  Building2, Phone, Mail, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import ClienteModal, { type ClienteRow } from "@/components/admin/ClienteModal";
import ProyectoModal, { type ProyectoRow } from "@/components/admin/ProyectoModal";

// ─── Constantes ───────────────────────────────────────────────────────────────

const ADMIN_EMAILS = ["luis.visionbi@gmail.com", "luismiguelbotero2327@gmail.com"];

// ─── Tipos ────────────────────────────────────────────────────────────────────

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
  const [activeTab,   setActiveTab]   = useState<"agenda" | "clientes" | "proyectos">("agenda");
  const [showAll,     setShowAll]     = useState(false);

  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [clientes,    setClientes]    = useState<ClienteRow[]>([]);
  const [proyectos,   setProyectos]   = useState<ProyectoRow[]>([]);

  const [clienteModal,  setClienteModal]  = useState<{ open: boolean; cliente: ClienteRow | null }>({ open: false, cliente: null });
  const [proyectoModal, setProyectoModal] = useState<{ open: boolean; proyecto: ProyectoRow | null }>({ open: false, proyecto: null });

  // ── Cargar datos ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !ADMIN_EMAILS.includes(session.user.email ?? "")) {
      navigate("/admin");
      return;
    }

    const [agRes, sesRes, clRes, prRes] = await Promise.all([
      supabase.from("agendamientos").select("*, clientes(empresa, correo)").order("fecha_inicio"),
      supabase.from("sesiones_proyecto").select("*, proyectos(nombre, clientes(empresa))").order("fecha_inicio"),
      supabase.from("clientes").select("*").order("empresa"),
      supabase.from("proyectos").select("*, clientes(empresa)").order("nombre"),
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
    setLoading(false);
  }, [navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };

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

  const tabs = [
    { key: "agenda",    label: "Agenda",    icon: CalendarDays },
    { key: "clientes",  label: "Clientes",  icon: Users },
    { key: "proyectos", label: "Proyectos", icon: FolderKanban },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-[#1a3461] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-15 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <img
              src="/Logo.jpg"
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
          {tabs.map(({ key, label, icon: Icon }) => (
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
            </button>
          ))}
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
      </main>

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
