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

type Estado     = "abierto" | "en_progreso" | "resuelto" | "cerrado";
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

// ── Email templates ───────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, string> = {
  abierto:     "background:#fef9c3;color:#854d0e",
  en_progreso: "background:#dbeafe;color:#1d4ed8",
  resuelto:    "background:#dcfce7;color:#15803d",
  cerrado:     "background:#f1f5f9;color:#475569",
};

const ESTADO_LABEL: Record<string, string> = {
  abierto:     "Abierto",
  en_progreso: "En progreso",
  resuelto:    "Resuelto",
  cerrado:     "Cerrado",
};

function layout(bandaTitle: string, content: string, logoUrl: string): string {
  const logoImg = logoUrl
    ? `<img src="${logoUrl}" alt="VisionBI" height="56"
            style="display:block;height:56px;max-height:56px;margin:0 auto;object-fit:contain" />`
    : `<p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:900;
                color:#1a3461">Vision<span style="color:#00b8d9">BI</span></p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td>
<div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;
            border:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,0.07)">

  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:5px"></div>

  <div style="background:#ffffff;padding:24px 40px 20px;text-align:center;border-bottom:1px solid #e2e8f0">
    ${logoImg}
  </div>

  <div style="background:#1a3461;padding:12px 40px;text-align:center">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:600;
              color:#a8c4e8;letter-spacing:2px;text-transform:uppercase">${bandaTitle}</p>
  </div>

  <div style="padding:32px 40px;background:#ffffff">
    ${content}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#1a3461;font-weight:700">
      Equipo VisionBI<br>
      <span style="font-weight:400;color:#00b8d9;font-size:12px">Technology · Data Analytics</span>
    </p>
  </div>

  <div style="background:#1a3461;padding:16px 40px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;color:#a8c4e8">
      © 2025 VisionBI — Technology · Data Analytics
    </p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#5b7faa">
      Mensaje generado automáticamente. Por favor no respondas a este correo.
    </p>
  </div>

  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:3px"></div>

</div>
</td></tr>
</table>
</body>
</html>`;
}

function infoCard(borderColor: string, rows: string): string {
  return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${borderColor};
              border-radius:4px;padding:16px 20px;margin:20px 0">
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </div>`;
}

function fieldRow(label: string, value: string): string {
  return `<tr>
    <td style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#64748b;
               text-transform:uppercase;letter-spacing:1px;padding:8px 0 2px;
               border-top:1px solid #f1f5f9">${label}</td>
  </tr>
  <tr>
    <td style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;
               font-weight:600;padding-bottom:4px">${value}</td>
  </tr>`;
}

function ctaBtn(label: string): string {
  return `<div style="text-align:center;margin:24px 0 8px">
    <a href="https://visionbi.co/portal/tickets" target="_blank"
       style="display:inline-block;background:#1a3461;color:#ffffff;padding:12px 28px;
              border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;
              font-weight:700;font-size:14px;letter-spacing:0.5px">
      ${label}
    </a>
  </div>`;
}

function buildAsignadoHtml(titulo: string, logoUrl: string): string {
  const content = `
    <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      Tienes un nuevo ticket asignado
    </p>
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      Se te ha asignado el siguiente ticket de soporte. Ingresa al portal para revisarlo y comenzar a gestionarlo.
    </p>
    ${infoCard("#00b8d9", fieldRow("Ticket asignado", `<span style="font-size:15px">${titulo}</span>`))}
    ${ctaBtn("Ver ticket en el portal")}`;
  return layout("Ticket Asignado", content, logoUrl);
}

function buildEstadoHtml(titulo: string, nuevoEstado: string, logoUrl: string): string {
  const badge = ESTADO_BADGE[nuevoEstado] ?? "background:#f1f5f9;color:#475569";
  const label = ESTADO_LABEL[nuevoEstado] ?? nuevoEstado;
  const content = `
    <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      El estado de un ticket ha cambiado
    </p>
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      Un ticket que te involucra ha sido actualizado. Ingresa al portal para ver los detalles.
    </p>
    ${infoCard("#1a3461",
      fieldRow("Ticket", `<span style="font-size:15px">${titulo}</span>`) +
      fieldRow("Nuevo estado",
        `<span style="display:inline-block;padding:3px 12px;border-radius:99px;font-size:13px;
                      font-weight:700;${badge}">${label}</span>`)
    )}
    ${ctaBtn("Ver ticket en el portal")}`;
  return layout("Actualización de Ticket", content, logoUrl);
}

function buildEstimacionPropuestaHtml(titulo: string, horas: number, logoUrl: string): string {
  const content = `
    <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      Estimación de horas propuesta
    </p>
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      El asignado propuso una estimación de horas para este ticket crítico. Debes revisarla y aceptarla o rechazarla
      antes de que se pueda iniciar el progreso.
    </p>
    ${infoCard("#00b8d9",
      fieldRow("Ticket", `<span style="font-size:15px">${titulo}</span>`) +
      fieldRow("Horas estimadas", `<span style="font-size:15px">${horas}</span>`)
    )}
    ${ctaBtn("Revisar estimación")}`;
  return layout("Estimación de Horas", content, logoUrl);
}

function buildEstimacionAceptadaHtml(titulo: string, horas: number, logoUrl: string): string {
  const content = `
    <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      Estimación de horas aceptada
    </p>
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      El creador aceptó tu estimación. Ya puedes iniciar el progreso del ticket.
    </p>
    ${infoCard("#15803d",
      fieldRow("Ticket", `<span style="font-size:15px">${titulo}</span>`) +
      fieldRow("Horas estimadas", `<span style="font-size:15px">${horas}</span>`)
    )}
    ${ctaBtn("Iniciar progreso")}`;
  return layout("Estimación de Horas", content, logoUrl);
}

function buildEstimacionRechazadaHtml(titulo: string, horas: number, comentario: string, logoUrl: string): string {
  const content = `
    <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      Estimación de horas rechazada
    </p>
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      El creador rechazó tu estimación de ${horas} horas. Ingresa al portal para proponer una nueva.
    </p>
    ${infoCard("#dc2626",
      fieldRow("Ticket", `<span style="font-size:15px">${titulo}</span>`) +
      fieldRow("Motivo del rechazo", `<span style="font-size:14px">${comentario.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`)
    )}
    ${ctaBtn("Proponer nueva estimación")}`;
  return layout("Estimación de Horas", content, logoUrl);
}

function buildComentarioHtml(titulo: string, texto: string, logoUrl: string): string {
  const content = `
    <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      Nuevo comentario en tu ticket
    </p>
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      Alguien ha dejado un nuevo comentario. Ingresa al portal para responder.
    </p>
    ${infoCard("#00b8d9", fieldRow("Ticket", `<span style="font-size:15px">${titulo}</span>`))}
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #94a3b8;
                border-radius:4px;padding:14px 20px;margin-bottom:4px">
      <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                color:#64748b;text-transform:uppercase;letter-spacing:1px">Comentario</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#334155;line-height:1.7">
        ${texto.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}
      </p>
    </div>
    ${ctaBtn("Responder en el portal")}`;
  return layout("Nuevo Comentario", content, logoUrl);
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

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const logoUrl = siteUrl ? `${siteUrl}/Logo.jpg` : "";

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
        estimacion_estado: prioridad === "critica" ? "pendiente" : "no_requerida",
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
          buildAsignadoHtml(titulo, logoUrl),
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

      if (nuevo_estado === "en_progreso" && ticket.prioridad === "critica" && ticket.estimacion_estado !== "aceptada") {
        return fail("Debes tener una estimación de horas aceptada por el creador antes de iniciar el progreso.", 403);
      }

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

      const label = ESTADO_LABEL[nuevo_estado] ?? nuevo_estado;
      const meta  = { ticket_id };

      await notifyAndEmail(
        admin, [ticket.creador_id, ticket.asignado_id].filter(Boolean), user.id,
        "ticket_estado", `Ticket actualizado: ${ticket.titulo}`,
        `El estado cambió a "${label}".`, meta,
        `[VisionBI] Ticket actualizado: ${ticket.titulo}`,
        buildEstadoHtml(ticket.titulo, nuevo_estado, logoUrl),
      );

      return ok({ success: true, ticket: updated });
    }

    // ── SET-ESTIMACION ────────────────────────────────────────────────────────
    if (action === "set-estimacion") {
      const { ticket_id, horas } = body;
      if (!ticket_id || horas === undefined || horas === null) return fail("ticket_id y horas son requeridos.");
      const horasNum = Number(horas);
      if (!Number.isFinite(horasNum) || horasNum <= 0) return fail("Las horas deben ser un número mayor a 0.");

      const { data: ticket, error: fetchErr } = await admin
        .from("tickets").select("*").eq("id", ticket_id).single();
      if (fetchErr || !ticket) return fail("Ticket no encontrado.", 404);

      if (ticket.prioridad !== "critica") return fail("Este ticket no requiere estimación de horas.", 403);
      if (!ticket.asignado_id || user.id !== ticket.asignado_id)
        return fail("Solo el usuario asignado puede proponer una estimación.", 403);
      if (!["pendiente", "rechazada"].includes(ticket.estimacion_estado))
        return fail("La estimación de horas ya fue enviada para este ticket.", 403);

      const { data: updated, error: updErr } = await admin
        .from("tickets")
        .update({
          estimacion_horas: horasNum,
          estimacion_estado: "en_revision",
          estimacion_comentario_rechazo: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticket_id).select().single();
      if (updErr) throw updErr;

      await admin.from("ticket_actividad").insert({
        ticket_id,
        usuario_id: user.id,
        tipo:       "estimacion",
        contenido:  { accion: "propuesta", horas: horasNum },
      });

      await notifyAndEmail(
        admin, [ticket.creador_id], user.id,
        "ticket_estimacion", "Estimación de horas propuesta", `Se propusieron ${horasNum}h para: ${ticket.titulo}`,
        { ticket_id },
        `[VisionBI] Estimación de horas propuesta: ${ticket.titulo}`,
        buildEstimacionPropuestaHtml(ticket.titulo, horasNum, logoUrl),
      );

      return ok({ success: true, ticket: updated });
    }

    // ── APPROVE-ESTIMACION ────────────────────────────────────────────────────
    if (action === "approve-estimacion") {
      const { ticket_id, aprobado, comentario } = body;
      if (!ticket_id || typeof aprobado !== "boolean") return fail("ticket_id y aprobado son requeridos.");
      if (!aprobado && !comentario?.trim()) return fail("Debes indicar un motivo de rechazo.");

      const { data: ticket, error: fetchErr } = await admin
        .from("tickets").select("*").eq("id", ticket_id).single();
      if (fetchErr || !ticket) return fail("Ticket no encontrado.", 404);

      if (user.id !== ticket.creador_id) return fail("Solo el creador del ticket puede aceptar o rechazar la estimación.", 403);
      if (ticket.estimacion_estado !== "en_revision") return fail("No hay una estimación pendiente de revisión.", 403);

      const updates: Record<string, unknown> = {
        estimacion_estado: aprobado ? "aceptada" : "rechazada",
        estimacion_comentario_rechazo: aprobado ? null : comentario.trim(),
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updErr } = await admin
        .from("tickets").update(updates).eq("id", ticket_id).select().single();
      if (updErr) throw updErr;

      await admin.from("ticket_actividad").insert({
        ticket_id,
        usuario_id: user.id,
        tipo:       "estimacion",
        contenido:  aprobado
          ? { accion: "aceptada", horas: ticket.estimacion_horas }
          : { accion: "rechazada", horas: ticket.estimacion_horas, comentario: comentario.trim() },
      });

      if (ticket.asignado_id) {
        if (aprobado) {
          await notifyAndEmail(
            admin, [ticket.asignado_id], user.id,
            "ticket_estimacion", "Estimación de horas aceptada", `Tu estimación de ${ticket.estimacion_horas}h fue aceptada: ${ticket.titulo}`,
            { ticket_id },
            `[VisionBI] Estimación de horas aceptada: ${ticket.titulo}`,
            buildEstimacionAceptadaHtml(ticket.titulo, ticket.estimacion_horas, logoUrl),
          );
        } else {
          await notifyAndEmail(
            admin, [ticket.asignado_id], user.id,
            "ticket_estimacion", "Estimación de horas rechazada", `Tu estimación fue rechazada: ${ticket.titulo}`,
            { ticket_id },
            `[VisionBI] Estimación de horas rechazada: ${ticket.titulo}`,
            buildEstimacionRechazadaHtml(ticket.titulo, ticket.estimacion_horas, comentario.trim(), logoUrl),
          );
        }
      }

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
        buildAsignadoHtml(ticket.titulo, logoUrl),
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
        buildComentarioHtml(ticket.titulo, texto.trim(), logoUrl),
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
