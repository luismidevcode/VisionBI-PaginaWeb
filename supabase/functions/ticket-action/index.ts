import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok   = (body: object) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) =>
  new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── State machine (mirrors src/lib/ticketStateMachine.ts) ─────────────────────

type Estado    = "abierto" | "en_progreso" | "resuelto" | "cerrado";
type QuienPuede = "asignado" | "creador_o_admin";

const TRANSICIONES: Record<Estado, { to: Estado; quien: QuienPuede }[]> = {
  abierto:     [{ to: "en_progreso", quien: "asignado" }],
  en_progreso: [{ to: "resuelto",    quien: "asignado" }],
  resuelto:    [{ to: "cerrado",     quien: "creador_o_admin" }],
  cerrado:     [],
};

function puedeTransicionar(
  actual: Estado, nuevo: Estado,
  userId: string, creadorId: string, asignadoId: string | null, esAdmin: boolean,
): { permitido: boolean; razon?: string } {
  const t = TRANSICIONES[actual]?.find((x) => x.to === nuevo);
  if (!t) return { permitido: false, razon: `Transición ${actual} → ${nuevo} no permitida.` };
  if (t.quien === "asignado") {
    if (!asignadoId)           return { permitido: false, razon: "El ticket no tiene asignado." };
    if (userId !== asignadoId) return { permitido: false, razon: "Solo el asignado puede realizar esta acción." };
  }
  if (t.quien === "creador_o_admin") {
    if (userId !== creadorId && !esAdmin)
      return { permitido: false, razon: "Solo el creador o un administrador puede cerrar el ticket." };
  }
  return { permitido: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

async function notify(
  admin: SupabaseClient,
  userId: string, tipo: string, titulo: string, mensaje: string,
  metadata: Record<string, unknown> = {},
) {
  await admin.from("notificaciones").insert({ usuario_id: userId, tipo, titulo, mensaje, metadata });
}

async function getUserEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: eu } = await admin
    .from("empresa_usuarios").select("correo_usuario").eq("user_id", userId).maybeSingle();
  if (eu?.correo_usuario) return eu.correo_usuario;
  const { data: { user } } = await admin.auth.admin.getUserById(userId);
  return user?.email ?? null;
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from   = Deno.env.get("FROM_EMAIL") ?? "noreply@visionbi.co";
  if (!apiKey || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from, to, subject, html }),
    });
  } catch { /* email is best-effort */ }
}

async function notifyAndEmail(
  admin: SupabaseClient,
  userIds: string[], actorId: string,
  tipo: string, titulo: string, mensaje: string,
  metadata: Record<string, unknown>, subject: string, html: string,
) {
  for (const uid of new Set(userIds.filter((id) => id && id !== actorId))) {
    await notify(admin, uid, tipo, titulo, mensaje, metadata);
    const email = await getUserEmail(admin, uid);
    if (email) await sendEmail(email, subject, html);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("No autorizado.", 401);

    const URL_     = Deno.env.get("SUPABASE_URL")!;
    const ANON_    = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(URL_, ANON_, { global: { headers: { Authorization: authHeader } } });
    const admin      = createClient(URL_, SERVICE_);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return fail("No autorizado.", 401);

    const { data: isAdminResult } = await userClient.rpc("is_admin");
    const esAdmin = !!isAdminResult;

    // deno-lint-ignore no-explicit-any
    const body = await req.json() as Record<string, any>;
    const { action } = body as { action: string };

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { titulo, descripcion, prioridad, proyecto_id, asignado_id } = body;

      if (!titulo?.trim())  return fail("El título es requerido.");
      if (!["baja","media","alta","critica"].includes(prioridad)) return fail("Prioridad inválida.");
      if (!proyecto_id)     return fail("El proyecto es requerido.");

      const { data: ticket, error } = await admin.from("tickets").insert({
        titulo:      titulo.trim(),
        descripcion: descripcion?.trim() ?? null,
        prioridad,
        proyecto_id,
        creador_id:  user.id,
        asignado_id: asignado_id ?? null,
      }).select().single();
      if (error) throw error;

      await admin.from("ticket_actividad").insert({
        ticket_id:  ticket.id,
        usuario_id: user.id,
        tipo:       "estado",
        contenido:  { estado_anterior: null, estado_nuevo: "abierto", mensaje: "Ticket creado" },
      });

      if (asignado_id && asignado_id !== user.id) {
        const meta = { ticket_id: ticket.id };
        await notifyAndEmail(
          admin, [asignado_id], user.id,
          "ticket_asignado", "Nuevo ticket asignado", `Se te asignó el ticket: ${titulo}`, meta,
          `[VisionBI] Nuevo ticket asignado: ${titulo}`,
          `<p>Se te ha asignado un nuevo ticket: <strong>${titulo}</strong>.</p>`,
        );
      }

      return ok({ success: true, ticket });
    }

    // ── UPDATE-ESTADO ─────────────────────────────────────────────────────────
    if (action === "update-estado") {
      const { ticket_id, nuevo_estado } = body;
      if (!ticket_id || !nuevo_estado) return fail("ticket_id y nuevo_estado son requeridos.");

      const { data: ticket, error: fetchErr } = await admin
        .from("tickets").select("*").eq("id", ticket_id).single();
      if (fetchErr || !ticket) return fail("Ticket no encontrado.", 404);

      const resultado = puedeTransicionar(
        ticket.estado, nuevo_estado,
        user.id, ticket.creador_id, ticket.asignado_id, esAdmin,
      );
      if (!resultado.permitido) return fail(resultado.razon ?? "Transición no permitida.", 403);

      const ahora = new Date().toISOString();
      const updates: Record<string, unknown> = { estado: nuevo_estado, updated_at: ahora };
      if (nuevo_estado === "resuelto") updates.resolved_at = ahora;
      if (nuevo_estado === "cerrado")  updates.closed_at   = ahora;

      const { data: updated, error: updErr } = await admin
        .from("tickets").update(updates).eq("id", ticket_id).select().single();
      if (updErr) throw updErr;

      await admin.from("ticket_actividad").insert({
        ticket_id,
        usuario_id: user.id,
        tipo:       "estado",
        contenido:  { estado_anterior: ticket.estado, estado_nuevo: nuevo_estado },
      });

      const labels: Record<string, string> = {
        en_progreso: "En progreso", resuelto: "Resuelto", cerrado: "Cerrado",
      };
      const label = labels[nuevo_estado] ?? nuevo_estado;
      const meta  = { ticket_id };

      await notifyAndEmail(
        admin, [ticket.creador_id, ticket.asignado_id].filter(Boolean), user.id,
        "ticket_estado", `Ticket actualizado: ${ticket.titulo}`,
        `El estado cambió a "${label}".`, meta,
        `[VisionBI] Ticket actualizado: ${ticket.titulo}`,
        `<p>El ticket <strong>${ticket.titulo}</strong> cambió a estado <strong>${label}</strong>.</p>`,
      );

      return ok({ success: true, ticket: updated });
    }

    // ── ASSIGN ────────────────────────────────────────────────────────────────
    if (action === "assign") {
      const { ticket_id, asignado_id } = body;
      if (!ticket_id || !asignado_id) return fail("ticket_id y asignado_id son requeridos.");

      const { data: ticket, error: fetchErr } = await admin
        .from("tickets").select("*").eq("id", ticket_id).single();
      if (fetchErr || !ticket) return fail("Ticket no encontrado.", 404);

      if (!esAdmin) return fail("Solo un administrador puede asignar tickets.", 403);

      const { data: updated, error: updErr } = await admin
        .from("tickets")
        .update({ asignado_id, updated_at: new Date().toISOString() })
        .eq("id", ticket_id).select().single();
      if (updErr) throw updErr;

      await admin.from("ticket_actividad").insert({
        ticket_id,
        usuario_id: user.id,
        tipo:       "asignacion",
        contenido:  { asignado_anterior: ticket.asignado_id, asignado_nuevo: asignado_id },
      });

      await notifyAndEmail(
        admin, [asignado_id], user.id,
        "ticket_asignado", "Ticket asignado", `Se te asignó: ${ticket.titulo}`,
        { ticket_id },
        `[VisionBI] Ticket asignado: ${ticket.titulo}`,
        `<p>Se te ha asignado el ticket: <strong>${ticket.titulo}</strong>.</p>`,
      );

      return ok({ success: true, ticket: updated });
    }

    // ── COMMENT ───────────────────────────────────────────────────────────────
    if (action === "comment") {
      const { ticket_id, texto } = body;
      if (!ticket_id || !texto?.trim()) return fail("ticket_id y texto son requeridos.");

      const { data: ticket } = await admin
        .from("tickets").select("titulo, creador_id, asignado_id").eq("id", ticket_id).single();
      if (!ticket) return fail("Ticket no encontrado.", 404);

      const { data: actividad, error } = await admin.from("ticket_actividad").insert({
        ticket_id,
        usuario_id: user.id,
        tipo:       "comentario",
        contenido:  { texto: texto.trim() },
      }).select().single();
      if (error) throw error;

      await notifyAndEmail(
        admin, [ticket.creador_id, ticket.asignado_id].filter(Boolean), user.id,
        "ticket_comentario", `Nuevo comentario: ${ticket.titulo}`,
        texto.trim().slice(0, 120),
        { ticket_id },
        `[VisionBI] Nuevo comentario en: ${ticket.titulo}`,
        `<p>Nuevo comentario en el ticket <strong>${ticket.titulo}</strong>:</p><blockquote>${texto.trim()}</blockquote>`,
      );

      return ok({ success: true, actividad });
    }

    return fail("Acción no reconocida.");
  } catch (err) {
    console.error("[ticket-action]", err);
    return new Response(
      JSON.stringify({ success: false, error: "Error interno del servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
