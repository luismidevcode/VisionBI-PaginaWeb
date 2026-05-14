import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Google Auth ──────────────────────────────────────────────────────────────

// OAuth 2.0 con refresh_token del usuario propietario del calendario.
// Necesario para crear eventos con Google Meet (conferenceDataVersion=1).
async function getOAuthAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token)
    throw new Error(`OAuth token failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ─── ICS ─────────────────────────────────────────────────────────────────────

function generateICS(params: {
  uid:         string;
  summary:     string;
  description: string;
  location:    string;
  startISO:    string;
  endISO:      string;
  organizer:   string;
  attendee:    string;
}): string {
  const toUTC = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VisionBI//Business Intelligence//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `DTSTART:${toUTC(params.startISO)}`,
    `DTEND:${toUTC(params.endISO)}`,
    `DTSTAMP:${toUTC(new Date().toISOString())}`,
    `UID:${params.uid}@visionbi.co`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, "\\n")}`,
    `LOCATION:${params.location}`,
    `ORGANIZER;CN=VisionBI:mailto:${params.organizer}`,
    `ATTENDEE;RSVP=TRUE;CN=Cliente:mailto:${params.attendee}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function icsToBase64(ics: string): string {
  const bytes = new TextEncoder().encode(ics);
  return btoa(String.fromCharCode(...bytes));
}

// ─── Email cliente ────────────────────────────────────────────────────────────

function buildClientEmailHtml(
  empresa: string, tipo_encuentro: string,
  dateStr: string, timeRange: string, meetLink: string, logoUrl: string
): string {
  const logoImg = logoUrl
    ? `<img src="${logoUrl}" alt="VisionBI" height="64"
            style="display:block;height:64px;max-height:64px;margin:0 auto;object-fit:contain" />`
    : `<p style="margin:0;font-family:Arial,sans-serif;font-size:24px;font-weight:900;
                color:#1a3461;letter-spacing:0.5px">Vision<span style="color:#00b8d9">BI</span></p>`;

  const meetBtn = meetLink ? `
      <div style="text-align:center;margin:28px 0 20px">
        <a href="${meetLink}" target="_blank"
           style="display:inline-block;background:#1a3461;color:#ffffff;
                  padding:13px 32px;border-radius:6px;text-decoration:none;
                  font-family:Arial,sans-serif;font-weight:700;font-size:14px;
                  letter-spacing:0.5px">
          Unirse a la reunión — Google Meet
        </a>
        <p style="margin:10px 0 0;font-family:Arial,sans-serif;color:#64748b;font-size:11px">
          Enlace directo:
          <a href="${meetLink}" style="color:#1a3461;word-break:break-all">${meetLink}</a>
        </p>
      </div>` : "";

  const divider = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td>
<div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:8px;
            overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,0.07)">

  <!-- FRANJA SUPERIOR CORPORATIVA -->
  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:5px"></div>

  <!-- CABECERA BLANCA CON LOGO -->
  <div style="background:#ffffff;padding:28px 40px 24px;text-align:center;
              border-bottom:1px solid #e2e8f0">
    ${logoImg}
  </div>

  <!-- BANDA DE TÍTULO NAVY -->
  <div style="background:#1a3461;padding:13px 40px;text-align:center">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:600;
              color:#a8c4e8;letter-spacing:2px;text-transform:uppercase">
      Confirmación de Cita
    </p>
  </div>

  <!-- CUERPO -->
  <div style="padding:36px 40px;background:#ffffff">

    <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      Estimado/a equipo de ${empresa}:
    </p>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      Nos complace confirmar su próxima reunión con VisionBI.
      A continuación encontrará los detalles de la cita agendada:
    </p>

    <!-- DETALLES -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #00b8d9;
                border-radius:4px;padding:20px 24px;margin-bottom:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                     color:#64748b;text-transform:uppercase;letter-spacing:1.2px;
                     padding-bottom:4px" colspan="2">Tipo de reunión</td>
        </tr>
        <tr>
          <td style="font-family:Arial,sans-serif;font-size:16px;color:#1a3461;font-weight:700;
                     padding-bottom:18px" colspan="2">${tipo_encuentro}</td>
        </tr>
        <tr>
          <td width="50%" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                                  color:#64748b;text-transform:uppercase;letter-spacing:1.2px;
                                  padding-bottom:4px">Fecha</td>
          <td width="50%" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                                  color:#64748b;text-transform:uppercase;letter-spacing:1.2px;
                                  padding-bottom:4px">Hora (Colombia)</td>
        </tr>
        <tr>
          <td style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;
                     font-weight:600;text-transform:capitalize">${dateStr}</td>
          <td style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;
                     font-weight:600">${timeRange}</td>
        </tr>
      </table>
    </div>

    ${meetBtn}
    ${divider}

    <!-- INSTRUCCIÓN ICS -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;
                border-radius:4px;padding:14px 18px;margin-bottom:24px">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;
                line-height:1.6;color:#14532d">
        <strong>Invitación al calendario adjunta.</strong><br>
        El archivo <em>cita-visionbi.ics</em> adjunto le permite agregar esta cita
        automáticamente a Google Calendar, Outlook o Apple Calendar.
      </p>
    </div>

    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:1.8;color:#475569">
      Si necesita modificar o cancelar esta cita, le solicitamos comunicarse
      con al menos 24 horas de anticipación a través de:<br>
      <a href="mailto:info.visionbi@gmail.com"
         style="color:#1a3461;font-weight:700;text-decoration:none">
        info.visionbi@gmail.com
      </a>
    </p>

    ${divider}

    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#334155;line-height:1.7">
      Agradecemos su confianza en VisionBI.<br>
      Quedamos atentos a cualquier inquietud que pueda surgir.
    </p>
    <p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:13px;
              color:#1a3461;font-weight:700">
      Equipo VisionBI<br>
      <span style="font-weight:400;color:#00b8d9;font-size:12px">
        Technology · Data Analytics
      </span>
    </p>

  </div>

  <!-- PIE -->
  <div style="background:#1a3461;padding:18px 40px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;color:#a8c4e8">
      © 2025 VisionBI — Technology · Data Analytics
    </p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#5b7faa">
      Este mensaje es de carácter confidencial y está dirigido exclusivamente a su destinatario.
    </p>
  </div>

  <!-- FRANJA INFERIOR CORPORATIVA -->
  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:3px"></div>

</div>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Email interno ────────────────────────────────────────────────────────────

function buildInternalEmailHtml(
  empresa: string, nit_cedula: string, correo: string, telefono: string,
  num_colaboradores: string, tipo_encuentro: string, motivo: string,
  dateStr: string, timeRange: string, meetLink: string, logoUrl: string
): string {
  const logoImg = logoUrl
    ? `<img src="${logoUrl}" alt="VisionBI" height="56"
            style="display:block;height:56px;max-height:56px;margin:0 auto;object-fit:contain" />`
    : `<p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:900;
                color:#1a3461;letter-spacing:0.5px">Vision<span style="color:#00b8d9">BI</span></p>`;

  const row = (label: string, value: string) => `
    <tr>
      <td style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#64748b;
                 text-transform:uppercase;letter-spacing:0.8px;padding:8px 0 2px;
                 border-top:1px solid #e2e8f0;width:38%">${label}</td>
      <td style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b;
                 padding:8px 0 2px;border-top:1px solid #e2e8f0">${value}</td>
    </tr>`;

  const meetBtn = meetLink ? `
    <div style="text-align:center;margin:20px 0">
      <a href="${meetLink}" target="_blank"
         style="display:inline-block;background:#1a3461;color:#ffffff;
                padding:11px 28px;border-radius:6px;text-decoration:none;
                font-family:Arial,sans-serif;font-weight:700;font-size:13px;
                letter-spacing:0.5px">
        Unirse a Google Meet
      </a>
      <p style="margin:8px 0 0;font-family:Arial,sans-serif;color:#64748b;font-size:11px">
        <a href="${meetLink}" style="color:#1a3461;word-break:break-all">${meetLink}</a>
      </p>
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td>
<div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:8px;
            overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,0.07)">

  <!-- FRANJA SUPERIOR CORPORATIVA -->
  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:5px"></div>

  <!-- CABECERA BLANCA CON LOGO -->
  <div style="background:#ffffff;padding:24px 40px 20px;text-align:center;
              border-bottom:1px solid #e2e8f0">
    ${logoImg}
  </div>

  <!-- BANDA DE TÍTULO NAVY -->
  <div style="background:#1a3461;padding:12px 40px;text-align:center">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:600;
              color:#a8c4e8;letter-spacing:2px;text-transform:uppercase">
      Notificación Interna · Nueva Cita
    </p>
  </div>

  <!-- CUERPO -->
  <div style="padding:32px 40px;background:#ffffff">

    <!-- DETALLES DE LA REUNIÓN -->
    <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;
              color:#64748b;letter-spacing:1.2px;text-transform:uppercase">
      Detalles de la reunión
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1a3461;
                border-radius:4px;padding:4px 20px 12px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Tipo de reunión", `<strong>${tipo_encuentro}</strong>`)}
        ${row("Fecha", `<span style="text-transform:capitalize">${dateStr}</span>`)}
        ${row("Hora (Colombia)", timeRange)}
      </table>
    </div>

    ${meetBtn}

    <div style="height:20px"></div>

    <!-- DATOS DEL CLIENTE -->
    <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;
              color:#64748b;letter-spacing:1.2px;text-transform:uppercase">
      Datos del cliente
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #00b8d9;
                border-radius:4px;padding:4px 20px 12px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Empresa", `<strong>${empresa}</strong>`)}
        ${row("Colaboradores", num_colaboradores)}
        ${row("NIT / Cédula", nit_cedula)}
        ${row("Correo", `<a href="mailto:${correo}" style="color:#1a3461">${correo}</a>`)}
        ${row("Teléfono", telefono)}
        ${row("Motivo", motivo)}
      </table>
    </div>

  </div>

  <!-- PIE -->
  <div style="background:#1a3461;padding:18px 40px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;color:#a8c4e8">
      © 2025 VisionBI — Uso interno exclusivo
    </p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#5b7faa">
      Technology · Data Analytics
    </p>
  </div>

  <!-- FRANJA INFERIOR CORPORATIVA -->
  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:3px"></div>

</div>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as {
      tipo_encuentro: string; empresa: string; nit_cedula: string;
      correo: string; telefono: string; motivo: string;
      num_colaboradores: string;
      fecha_inicio: string; fecha_fin: string;
    };
    const {
      tipo_encuentro, empresa, nit_cedula, correo, telefono, motivo,
      num_colaboradores, fecha_inicio, fecha_fin,
    } = body;

    // 1. Upsert cliente
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Bloquear si el NIT ya existe (ya es cliente o ya agendó diagnóstico)
    const { data: existingByNit } = await supabase
      .from("clientes")
      .select("id")
      .eq("nit_cedula", nit_cedula.trim())
      .maybeSingle();

    if (existingByNit) {
      return new Response(
        JSON.stringify({ error: "ALREADY_CLIENT" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .upsert(
        { empresa, nit_cedula, correo, telefono, num_colaboradores, updated_at: new Date().toISOString() },
        { onConflict: "correo" }
      ).select().single();
    if (clienteErr) throw clienteErr;

    // 2. Crear agendamiento
    const { data: agenda, error: agendaErr } = await supabase
      .from("agendamientos")
      .insert({ cliente_id: cliente.id, tipo_encuentro, motivo, fecha_inicio, fecha_fin })
      .select().single();
    if (agendaErr) throw agendaErr;

    const accessToken = await getOAuthAccessToken();

    // 3. Crear evento en Google Calendar con Meet integrado (conferenceDataVersion=1)
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID")!;
    const calDesc    = [
      `Empresa: ${empresa}`,
      `Colaboradores: ${num_colaboradores}`,
      `NIT/Cédula: ${nit_cedula}`,
      `Teléfono: ${telefono}`,
      `Correo: ${correo}`,
      `Motivo: ${motivo}`,
    ].join("\n");

    const notifyEmail = Deno.env.get("NOTIFY_EMAIL") ?? "";
    const attendees = [
      { email: correo },
      ...(notifyEmail ? [{ email: notifyEmail }] : []),
    ];

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary:     `${tipo_encuentro} – ${empresa} | VisionBI`,
          description: calDesc,
          start:       { dateTime: fecha_inicio, timeZone: "America/Bogota" },
          end:         { dateTime: fecha_fin,    timeZone: "America/Bogota" },
          attendees,
          conferenceData: {
            createRequest: {
              requestId:             agenda.id,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      }
    );
    const eventData = await eventRes.json();

    let meetLink    = "";
    let meetError   = "";
    let calendarStatus = "ok";
    if (!eventRes.ok) {
      calendarStatus = `error ${eventRes.status}: ${JSON.stringify(eventData)}`;
      console.error("[Calendar] Error:", calendarStatus);
    } else {
      console.log("[Calendar] Evento creado:", eventData.id);
      // Extraer enlace Meet del evento creado
      const entryPoints: { entryPointType: string; uri: string }[] =
        eventData.conferenceData?.entryPoints ?? [];
      const videoEntry = entryPoints.find((e) => e.entryPointType === "video");
      meetLink = videoEntry?.uri ?? eventData.conferenceData?.conferenceId
        ? `https://meet.google.com/${eventData.conferenceData.conferenceId}`
        : "";
      if (!meetLink) {
        meetError = `Meet no incluido: ${JSON.stringify(eventData.conferenceData ?? {})}`;
        console.warn("[Meet]", meetError);
      } else {
        console.log("[Meet] Enlace obtenido:", meetLink);
      }
      await supabase.from("agendamientos")
        .update({ google_event_id: eventData.id })
        .eq("id", agenda.id);
    }

    // 4. Generar ICS (incluye enlace Meet en descripción y ubicación)
    const fromEmail = Deno.env.get("FROM_EMAIL") ?? "agenda.visionbi@gmail.com";
    const icsDescription = meetLink
      ? `Empresa: ${empresa} | Motivo: ${motivo}\nEnlace Meet: ${meetLink}`
      : `Empresa: ${empresa} | Motivo: ${motivo}`;

    const icsContent = generateICS({
      uid:         agenda.id,
      summary:     `${tipo_encuentro} – VisionBI`,
      description: icsDescription,
      location:    meetLink || "Google Meet",
      startISO:    fecha_inicio,
      endISO:      fecha_fin,
      organizer:   fromEmail,
      attendee:    correo,
    });
    const icsBase64 = icsToBase64(icsContent);

    // 5. Preparar datos de formato para los correos
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const siteUrl   = Deno.env.get("SITE_URL") ?? "";
    const logoUrl   = siteUrl ? `${siteUrl}/Logo.jpg` : "";
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: "America/Bogota", weekday: "long", year: "numeric",
      month: "long", day: "numeric",
    };
    const timeOpts: Intl.DateTimeFormatOptions = {
      timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: true,
    };
    const start     = new Date(fecha_inicio);
    const end       = new Date(fecha_fin);
    const dateStr   = start.toLocaleDateString("es-CO", opts);
    const timeRange = `${start.toLocaleTimeString("es-CO", timeOpts)} – ${end.toLocaleTimeString("es-CO", timeOpts)}`;

    const icsAttachment = {
      filename:     "cita-visionbi.ics",
      content:      icsBase64,
      content_type: "text/calendar; method=REQUEST",
    };

    // 6a. Correo al cliente
    const clientRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:        `VisionBI <${fromEmail}>`,
        to:          [correo],
        subject:     `✅ Cita confirmada: ${tipo_encuentro} – VisionBI`,
        html:        buildClientEmailHtml(empresa, tipo_encuentro, dateStr, timeRange, meetLink, logoUrl),
        attachments: [icsAttachment],
      }),
    });
    const clientData = await clientRes.json();

    let emailStatus = "ok";
    if (!clientRes.ok) {
      emailStatus = `error ${clientRes.status}: ${JSON.stringify(clientData)}`;
      console.error("[Resend] Error correo cliente:", emailStatus);
    } else {
      console.log("[Resend] Correo cliente enviado:", clientData.id);
    }

    // 6b. Notificación interna
    if (notifyEmail) {
      const internalRes = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:        `VisionBI <${fromEmail}>`,
          to:          [notifyEmail],
          subject:     `📅 Nueva cita: ${tipo_encuentro} – ${empresa}`,
          html:        buildInternalEmailHtml(
                         empresa, nit_cedula, correo, telefono,
                         num_colaboradores, tipo_encuentro, motivo,
                         dateStr, timeRange, meetLink, logoUrl
                       ),
          attachments: [icsAttachment],
        }),
      });
      const internalData = await internalRes.json();
      if (!internalRes.ok) {
        console.error("[Resend] Error notificación interna:", internalData);
      } else {
        console.log("[Resend] Notificación interna enviada:", internalData.id);
      }
    }

    return new Response(
      JSON.stringify({
        success:         true,
        agendamiento_id: agenda.id,
        meet_link:       meetLink,
        meet_error:      meetError || undefined,
        calendar_status: calendarStatus,
        email_status:    emailStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Error general]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status:  500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
