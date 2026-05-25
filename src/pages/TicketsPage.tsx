import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Ticket as TicketIcon, ArrowLeft, Search, Clock } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import {
  Estado, Prioridad,
  ESTADO_LABELS, PRIORIDAD_LABELS, ESTADO_COLOR, PRIORIDAD_COLOR,
} from "@/lib/ticketStateMachine";
import { TicketModal, Ticket, Miembro, Proyecto } from "@/components/tickets/TicketModal";

// ── Tipos locales ─────────────────────────────────────────────────────────────

interface MyEu {
  user_id:    string;
  cliente_id: string;
  role:       string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emailOf(userId: string, miembros: Miembro[]) {
  return miembros.find((m) => m.user_id === userId)?.correo_usuario ?? "—";
}

function avgResolutionHours(tickets: Ticket[]): number | null {
  const resolved = tickets.filter((t) => t.resolved_at);
  if (resolved.length === 0) return null;
  const total = resolved.reduce(
    (sum, t) => sum + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()),
    0,
  );
  return Math.round(total / resolved.length / 3600000);
}

const ESTADOS:    Estado[]    = ["abierto", "en_progreso", "resuelto", "cerrado"];
const PRIORIDADES: Prioridad[] = ["baja", "media", "alta", "critica"];

// ── Componente ────────────────────────────────────────────────────────────────

const TicketsPage = () => {
  const navigate = useNavigate();

  const [myEu,      setMyEu]      = useState<MyEu | null>(null);
  const [esAdmin,   setEsAdmin]   = useState(false);
  const [tickets,   setTickets]   = useState<Ticket[]>([]);
  const [miembros,  setMiembros]  = useState<Miembro[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [search,          setSearch]          = useState("");
  const [filterEstado,    setFilterEstado]    = useState<string>("todos");
  const [filterPrioridad, setFilterPrioridad] = useState<string>("todas");
  const [filterProyecto,  setFilterProyecto]  = useState<string>("todos");

  const [modal, setModal] = useState<{ open: boolean; ticketId?: string }>({ open: false });

  // ── Carga de datos ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/portal"); return; }

      const { data: eu } = await supabase
        .from("empresa_usuarios")
        .select("user_id, cliente_id, role")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!eu) { navigate("/portal"); return; }
      setMyEu(eu as MyEu);

      const { data: adminResult } = await supabase.rpc("is_admin");
      setEsAdmin(!!adminResult);

      const [{ data: miemb }, { data: proy }, { data: tix }] = await Promise.all([
        supabase
          .from("empresa_usuarios")
          .select("user_id, correo_usuario, role")
          .eq("cliente_id", (eu as MyEu).cliente_id)
          .eq("status", "active"),
        supabase
          .from("proyectos")
          .select("id, nombre")
          .eq("cliente_id", (eu as MyEu).cliente_id)
          .eq("estado", "activo"),
        supabase
          .from("tickets")
          .select("*, proyecto:proyectos(nombre)")
          .order("created_at", { ascending: false }),
      ]);

      setMiembros((miemb as Miembro[]) ?? []);
      setProyectos((proy as Proyecto[]) ?? []);
      setTickets((tix as Ticket[]) ?? []);
      setLoading(false);
    };
    load();
  }, [navigate]);

  // ── Filtrado y stats ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (filterEstado    !== "todos"  && t.estado    !== filterEstado)    return false;
      if (filterPrioridad !== "todas"  && t.prioridad !== filterPrioridad) return false;
      if (filterProyecto  !== "todos"  && t.proyecto_id !== filterProyecto) return false;
      if (search && !t.titulo.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tickets, filterEstado, filterPrioridad, filterProyecto, search]);

  const stats = useMemo(() => {
    const by: Record<string, number> = { abierto: 0, en_progreso: 0, resuelto: 0, cerrado: 0 };
    tickets.forEach((t) => { by[t.estado] = (by[t.estado] ?? 0) + 1; });
    return { total: tickets.length, by, avg: avgResolutionHours(tickets) };
  }, [tickets]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const onCreated = (t: Ticket) => setTickets((prev) => [t, ...prev]);
  const onUpdated = (t: Ticket) => setTickets((prev) => prev.map((x) => (x.id === t.id ? t : x)));

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/portal/dashboard")}
              className="text-slate-400 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <TicketIcon className="h-5 w-5 text-[#1a3461]" />
              <span className="font-semibold text-[#1a3461]">Tickets</span>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-[#1a3461] hover:bg-[#15294f] text-white gap-2"
            onClick={() => setModal({ open: true })}
          >
            <Plus className="h-4 w-4" /> Nuevo ticket
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total",       value: stats.total,              color: "text-slate-700" },
            { label: "Abiertos",    value: stats.by.abierto ?? 0,    color: "text-yellow-600" },
            { label: "En progreso", value: stats.by.en_progreso ?? 0, color: "text-blue-600" },
            { label: "Resueltos",   value: stats.by.resuelto ?? 0,   color: "text-green-600" },
            { label: "Cerrados",    value: stats.by.cerrado ?? 0,    color: "text-slate-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tiempo promedio de resolución */}
        {stats.avg !== null && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-white rounded-xl border border-slate-200 px-4 py-3">
            <Clock className="h-4 w-4 text-slate-400" />
            Tiempo promedio de resolución: <strong className="text-slate-700">{stats.avg}h</strong>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar tickets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="todos">Todos los estados</option>
            {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_LABELS[s]}</option>)}
          </select>

          <select
            value={filterPrioridad}
            onChange={(e) => setFilterPrioridad(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="todas">Todas las prioridades</option>
            {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>)}
          </select>

          <select
            value={filterProyecto}
            onChange={(e) => setFilterProyecto(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="todos">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        {/* Lista de tickets */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <TicketIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {tickets.length === 0 ? "No hay tickets aún" : "No hay tickets con estos filtros"}
            </p>
            {tickets.length === 0 && (
              <p className="text-slate-400 text-sm mt-1">Crea el primer ticket con el botón de arriba.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <div
                key={t.id}
                onClick={() => setModal({ open: true, ticketId: t.id })}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-[#1a3461]/30 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  {/* Prioridad stripe */}
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${
                    t.prioridad === "critica" ? "bg-red-500" :
                    t.prioridad === "alta"    ? "bg-orange-400" :
                    t.prioridad === "media"   ? "bg-blue-400" : "bg-slate-300"
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 truncate">{t.titulo}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${ESTADO_COLOR[t.estado]}`}>
                        {ESTADO_LABELS[t.estado]}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${PRIORIDAD_COLOR[t.prioridad]}`}>
                        {PRIORIDAD_LABELS[t.prioridad]}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                      <span>{t.proyecto?.nombre}</span>
                      {t.asignado_id && <span>Asignado: {emailOf(t.asignado_id, miembros)}</span>}
                      <span>{new Date(t.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <TicketModal
        open={modal.open}
        ticketId={modal.ticketId}
        onClose={() => setModal({ open: false })}
        onCreated={onCreated}
        onUpdated={onUpdated}
        miembros={miembros}
        proyectos={proyectos}
        myUserId={myEu?.user_id ?? ""}
        esAdmin={esAdmin}
      />
    </div>
  );
};

export default TicketsPage;
