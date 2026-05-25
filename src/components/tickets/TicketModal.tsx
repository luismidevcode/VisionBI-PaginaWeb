import { useState, useEffect } from "react";
import { Paperclip, Send, X, Loader2, Download } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import {
  Estado, Prioridad,
  puedeTransicionar, transicionesDisponibles,
  ESTADO_LABELS, PRIORIDAD_LABELS, ESTADO_COLOR, PRIORIDAD_COLOR,
} from "@/lib/ticketStateMachine";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Ticket {
  id:          string;
  titulo:      string;
  descripcion: string | null;
  prioridad:   Prioridad;
  estado:      Estado;
  proyecto_id: string;
  creador_id:  string;
  asignado_id: string | null;
  resolved_at: string | null;
  closed_at:   string | null;
  created_at:  string;
  updated_at:  string;
  proyecto:    { nombre: string } | null;
}

export interface Miembro {
  user_id:        string;
  correo_usuario: string;
  role:           string;
}

export interface Proyecto {
  id:     string;
  nombre: string;
}

interface Actividad {
  id:         string;
  tipo:       string;
  usuario_id: string;
  contenido:  Record<string, unknown>;
  created_at: string;
}

interface Adjunto {
  id:        string;
  url:       string;
  nombre:    string;
  tipo_mime: string | null;
}

interface Props {
  open:       boolean;
  ticketId?:  string;
  onClose:    () => void;
  onCreated:  (t: Ticket) => void;
  onUpdated:  (t: Ticket) => void;
  miembros:   Miembro[];
  proyectos:  Proyecto[];
  myUserId:   string;
  esAdmin:    boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORIDADES: Prioridad[]  = ["baja", "media", "alta", "critica"];
const ESTADO_BTN_LABEL: Record<Estado, string> = {
  abierto:     "", // no button shown — transitions come from other states
  en_progreso: "Marcar como Resuelto",
  resuelto:    "Cerrar ticket",
  cerrado:     "",
};

function emailOf(userId: string, miembros: Miembro[]) {
  return miembros.find((m) => m.user_id === userId)?.correo_usuario ?? userId.slice(0, 8) + "…";
}

// ── Componente ────────────────────────────────────────────────────────────────

export const TicketModal = ({
  open, ticketId, onClose, onCreated, onUpdated,
  miembros, proyectos, myUserId, esAdmin,
}: Props) => {
  const isCreate = !ticketId;

  // ── Estado crear ──────────────────────────────────────────────────────────
  const [titulo,      setTitulo]      = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad,   setPrioridad]   = useState<Prioridad>("media");
  const [proyectoId,  setProyectoId]  = useState(proyectos[0]?.id ?? "");
  const [asignadoId,  setAsignadoId]  = useState("");
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Estado ver ────────────────────────────────────────────────────────────
  const [ticket,     setTicket]     = useState<Ticket | null>(null);
  const [actividad,  setActividad]  = useState<Actividad[]>([]);
  const [adjuntos,   setAdjuntos]   = useState<Adjunto[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading,    setLoading]    = useState(false);
  const [comentario, setComentario] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [transitioning,  setTransitioning]  = useState(false);
  const [assigning,      setAssigning]      = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [uploadingFile,  setUploadingFile]  = useState(false);

  // ── Reset al abrir ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (isCreate) {
      setTitulo(""); setDescripcion(""); setPrioridad("media");
      setProyectoId(proyectos[0]?.id ?? ""); setAsignadoId(""); setCreateError(null);
    } else {
      loadTicket();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketId]);

  const loadTicket = async () => {
    if (!ticketId) return;
    setLoading(true);
    const [{ data: t }, { data: act }, { data: adj }] = await Promise.all([
      supabase.from("tickets").select("*, proyecto:proyectos(nombre)").eq("id", ticketId).single(),
      supabase.from("ticket_actividad").select("*").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("ticket_adjuntos").select("*").eq("ticket_id", ticketId),
    ]);
    setTicket(t as Ticket);
    setActividad((act as Actividad[]) ?? []);
    const adjs = (adj as Adjunto[]) ?? [];
    setAdjuntos(adjs);
    setLoading(false);

    // Generate signed URLs for attachments
    if (adjs.length > 0) {
      const urls: Record<string, string> = {};
      await Promise.all(adjs.map(async (a) => {
        const { data } = await supabase.storage
          .from("ticket-adjuntos").createSignedUrl(a.url, 3600);
        if (data?.signedUrl) urls[a.id] = data.signedUrl;
      }));
      setSignedUrls(urls);
    }
  };

  // ── Crear ticket ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!titulo.trim()) { setCreateError("El título es requerido."); return; }
    if (!proyectoId)    { setCreateError("Selecciona un proyecto."); return; }
    setCreating(true); setCreateError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<{ success: boolean; ticket: Ticket; error?: string }>(
        "ticket-action",
        { body: { action: "create", titulo, descripcion, prioridad, proyecto_id: proyectoId, asignado_id: asignadoId || null } },
      );
      if (fnErr || !data?.success) { setCreateError(data?.error ?? "Error al crear ticket."); return; }
      onCreated(data.ticket);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  // ── Transición de estado ──────────────────────────────────────────────────
  const handleTransicion = async (nuevoEstado: Estado) => {
    if (!ticket) return;
    const result = puedeTransicionar(
      ticket.estado, nuevoEstado, myUserId, ticket.creador_id, ticket.asignado_id, esAdmin,
    );
    if (!result.permitido) { setError(result.razon ?? "No permitido."); return; }

    setTransitioning(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<{ success: boolean; ticket: Ticket; error?: string }>(
        "ticket-action",
        { body: { action: "update-estado", ticket_id: ticket.id, nuevo_estado: nuevoEstado } },
      );
      if (fnErr || !data?.success) { setError(data?.error ?? "Error al actualizar estado."); return; }
      setTicket(data.ticket);
      onUpdated(data.ticket);
      await loadTicket();
    } finally {
      setTransitioning(false);
    }
  };

  // ── Asignar ───────────────────────────────────────────────────────────────
  const handleAssign = async (newAsignadoId: string) => {
    if (!ticket) return;
    setAssigning(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<{ success: boolean; ticket: Ticket; error?: string }>(
        "ticket-action",
        { body: { action: "assign", ticket_id: ticket.id, asignado_id: newAsignadoId } },
      );
      if (fnErr || !data?.success) { setError(data?.error ?? "Error al asignar."); return; }
      setTicket(data.ticket);
      onUpdated(data.ticket);
      await loadTicket();
    } finally {
      setAssigning(false);
    }
  };

  // ── Comentar ──────────────────────────────────────────────────────────────
  const handleComment = async () => {
    if (!comentario.trim() || !ticket) return;
    setSendingComment(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<{ success: boolean; error?: string }>(
        "ticket-action",
        { body: { action: "comment", ticket_id: ticket.id, texto: comentario } },
      );
      if (fnErr || !data?.success) { setError(data?.error ?? "Error al comentar."); return; }
      setComentario("");
      await loadTicket();
    } finally {
      setSendingComment(false);
    }
  };

  // ── Subir adjunto ─────────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ticket) return;
    setUploadingFile(true); setError(null);
    try {
      const path = `${ticket.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("ticket-adjuntos").upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("ticket_adjuntos").insert({
        ticket_id: ticket.id, url: path, nombre: file.name, tipo_mime: file.type,
      });
      if (insErr) throw insErr;
      await loadTicket();
    } catch { setError("Error al subir el archivo."); }
    finally   { setUploadingFile(false); e.target.value = ""; }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const disponibles = ticket ? transicionesDisponibles(ticket.estado) : [];
  const canTransitionToNext = ticket
    ? disponibles.some((s) => puedeTransicionar(ticket.estado, s, myUserId, ticket.creador_id, ticket.asignado_id, esAdmin).permitido)
    : false;
  const canAssign = ticket
    ? (esAdmin || myUserId === ticket.creador_id || ["owner","manager"].includes(
        miembros.find((m) => m.user_id === myUserId)?.role ?? ""
      ))
    : false;

  // Inicio del ticket: abierto → en_progreso is the first transition
  const canStart = ticket?.estado === "abierto" &&
    puedeTransicionar("abierto", "en_progreso", myUserId, ticket.creador_id, ticket.asignado_id, esAdmin).permitido;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#1a3461]">
            {isCreate ? "Nuevo ticket" : ticket?.titulo ?? "…"}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
            {error}
          </div>
        )}

        {/* ── CREAR ── */}
        {isCreate && (
          <div className="space-y-4 pt-1">
            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}

            <div className="space-y-1.5">
              <Label>Título <span className="text-red-500">*</span></Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Describe el problema brevemente" />
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a3461]/20"
                placeholder="Detalla el problema, pasos para reproducirlo, etc."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <select
                  value={prioridad}
                  onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Proyecto</Label>
                <select
                  value={proyectoId}
                  onChange={(e) => setProyectoId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Asignar a</Label>
              <select
                value={asignadoId}
                onChange={(e) => setAsignadoId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="">Sin asignar</option>
                {miembros.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.correo_usuario}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button
                className="flex-1 bg-[#1a3461] hover:bg-[#15294f] text-white"
                onClick={handleCreate} disabled={creating}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Crear ticket
              </Button>
            </div>
          </div>
        )}

        {/* ── VER ── */}
        {!isCreate && (
          <>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : ticket && (
              <div className="space-y-5 pt-1">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ESTADO_COLOR[ticket.estado]}`}>
                    {ESTADO_LABELS[ticket.estado]}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PRIORIDAD_COLOR[ticket.prioridad]}`}>
                    {PRIORIDAD_LABELS[ticket.prioridad]}
                  </span>
                  <span className="text-xs text-slate-500 px-2 py-1">
                    {ticket.proyecto?.nombre}
                  </span>
                </div>

                {/* Descripción */}
                {ticket.descripcion && (
                  <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3">
                    {ticket.descripcion}
                  </p>
                )}

                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div>
                    <span className="font-semibold uppercase tracking-wide">Creado por</span>
                    <p className="mt-0.5 text-slate-700">{emailOf(ticket.creador_id, miembros)}</p>
                  </div>
                  <div>
                    <span className="font-semibold uppercase tracking-wide">Asignado a</span>
                    <div className="mt-0.5 flex items-center gap-1">
                      {canAssign ? (
                        <select
                          value={ticket.asignado_id ?? ""}
                          onChange={(e) => handleAssign(e.target.value)}
                          disabled={assigning}
                          className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white"
                        >
                          <option value="">Sin asignar</option>
                          {miembros.map((m) => (
                            <option key={m.user_id} value={m.user_id}>{m.correo_usuario}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-700">
                          {ticket.asignado_id ? emailOf(ticket.asignado_id, miembros) : "Sin asignar"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold uppercase tracking-wide">Creado</span>
                    <p className="mt-0.5 text-slate-700">
                      {new Date(ticket.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {ticket.resolved_at && (
                    <div>
                      <span className="font-semibold uppercase tracking-wide">Resuelto</span>
                      <p className="mt-0.5 text-slate-700">
                        {new Date(ticket.resolved_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Transiciones */}
                {ticket.estado !== "cerrado" && (canTransitionToNext) && (
                  <div className="flex gap-2 pt-1">
                    {canStart && (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleTransicion("en_progreso")}
                        disabled={transitioning}
                      >
                        {transitioning ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Iniciar progreso
                      </Button>
                    )}
                    {ticket.estado === "en_progreso" &&
                      puedeTransicionar("en_progreso", "resuelto", myUserId, ticket.creador_id, ticket.asignado_id, esAdmin).permitido && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleTransicion("resuelto")}
                        disabled={transitioning}
                      >
                        {transitioning ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Marcar como Resuelto
                      </Button>
                    )}
                    {ticket.estado === "resuelto" &&
                      puedeTransicionar("resuelto", "cerrado", myUserId, ticket.creador_id, ticket.asignado_id, esAdmin).permitido && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-400 text-slate-700"
                        onClick={() => handleTransicion("cerrado")}
                        disabled={transitioning}
                      >
                        {transitioning ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Cerrar ticket
                      </Button>
                    )}
                  </div>
                )}

                {/* Adjuntos */}
                {(adjuntos.length > 0 || ticket.estado !== "cerrado") && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Adjuntos</span>
                      {ticket.estado !== "cerrado" && (
                        <label className="cursor-pointer flex items-center gap-1 text-xs text-[#00b8d9] hover:underline">
                          <Paperclip className="h-3 w-3" />
                          {uploadingFile ? "Subiendo…" : "Adjuntar archivo"}
                          <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                        </label>
                      )}
                    </div>
                    {adjuntos.length > 0 ? (
                      <div className="space-y-1.5">
                        {adjuntos.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                            <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="flex-1 truncate text-slate-700">{a.nombre}</span>
                            {signedUrls[a.id] && (
                              <a
                                href={signedUrls[a.id]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#00b8d9] hover:text-[#0099b8]"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Sin adjuntos.</p>
                    )}
                  </div>
                )}

                {/* Actividad */}
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Actividad</span>
                  <div className="mt-2 space-y-3 max-h-52 overflow-y-auto pr-1">
                    {actividad.length === 0 && (
                      <p className="text-xs text-slate-400">Sin actividad registrada.</p>
                    )}
                    {actividad.map((a) => {
                      const autor = emailOf(a.usuario_id, miembros);
                      const fecha = new Date(a.created_at).toLocaleDateString("es-CO", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      });
                      if (a.tipo === "estado") {
                        const c = a.contenido as { estado_anterior?: string; estado_nuevo: string; mensaje?: string };
                        return (
                          <div key={a.id} className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                            <span>
                              <strong className="text-slate-700">{autor}</strong>
                              {c.estado_anterior
                                ? ` cambió estado de "${ESTADO_LABELS[c.estado_anterior as Estado]}" a "${ESTADO_LABELS[c.estado_nuevo as Estado]}"`
                                : ` ${c.mensaje ?? "creó el ticket"}`}
                              {" · "}{fecha}
                            </span>
                          </div>
                        );
                      }
                      if (a.tipo === "asignacion") {
                        const c = a.contenido as { asignado_nuevo: string };
                        return (
                          <div key={a.id} className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                            <span>
                              <strong className="text-slate-700">{autor}</strong>
                              {" asignó a "}<strong className="text-slate-700">{emailOf(c.asignado_nuevo, miembros)}</strong>
                              {" · "}{fecha}
                            </span>
                          </div>
                        );
                      }
                      if (a.tipo === "comentario") {
                        const c = a.contenido as { texto: string };
                        return (
                          <div key={a.id} className="bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-slate-700">{autor}</span>
                              <span className="text-xs text-slate-400">{fecha}</span>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">{c.texto}</p>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>

                {/* Comentar */}
                {ticket.estado !== "cerrado" && (
                  <div className="flex gap-2 pt-1 border-t border-slate-100">
                    <Input
                      placeholder="Escribe un comentario…"
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleComment()}
                      className="flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      className="bg-[#1a3461] hover:bg-[#15294f] text-white px-3"
                      onClick={handleComment}
                      disabled={sendingComment || !comentario.trim()}
                    >
                      {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
