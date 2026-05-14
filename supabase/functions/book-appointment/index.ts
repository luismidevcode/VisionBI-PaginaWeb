import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Google Auth ──────────────────────────────────────────────────────────────

function base64url(input: string | Uint8Array): string {
  const str =
    typeof input === "string"
      ? btoa(unescape(encodeURIComponent(input)))
      : btoa(String.fromCharCode(...input));
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleAccessToken(
  scopes = "https://www.googleapis.com/auth/calendar"
): Promise<string> {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
  const pem   = Deno.env.get("GOOGLE_PRIVATE_KEY")!.replace(/\\n/g, "\n");
  const now   = Math.floor(Date.now() / 1000);

  const header  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss:   email,
    scope: scopes,
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));
  const signingInput = `${header}.${payload}`;

  const pemContent = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt  = `${signingInput}.${base64url(new Uint8Array(sig))}`;
  const res  = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token)
    throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
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
    ? `<img src="${logoUrl}" alt="VisionBI" height="52"
            style="display:block;height:52px;max-height:52px;margin:0 auto 14px;object-fit:contain" />`
    : "";

  const meetBtn = meetLink ? `
      <div style="text-align:center;margin:28px 0 20px">
        <a href="${meetLink}" target="_blank"
           style="display:inline-block;background:#1d4ed8;color:#ffffff;
                  padding:13px 32px;border-radius:6px;text-decoration:none;
                  font-family:Georgia,serif;font-weight:700;font-size:14px;
                  letter-spacing:0.5px;border:2px solid #1e40af">
          Unirse a la reunión — Google Meet
        </a>
        <p style="margin:10px 0 0;font-family:Arial,sans-serif;color:#64748b;font-size:11px">
          Enlace directo:
          <a href="${meetLink}" style="color:#2563eb;word-break:break-all">${meetLink}</a>
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

  <!-- CABECERA -->
  <div style="background:#0f172a;padding:32px 40px;text-align:center">
    ${logoImg}
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:700;
              color:#ffffff;letter-spacing:0.5px">VisionBI</p>
    <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:12px;
              color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase">
      Business Intelligence
    </p>
  </div>

  <!-- BANDA DE TÍTULO -->
  <div style="background:#1d4ed8;padding:14px 40px;text-align:center">
    <p style="margin:0;font-family:Georgia,serif;font-size:15px;font-weight:400;
              color:#bfdbfe;letter-spacing:0.3px">
      Confirmación de Cita
    </p>
  </div>

  <!-- CUERPO -->
  <div style="padding:36px 40px;background:#ffffff">

    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:16px;color:#0f172a;font-weight:700">
      Estimado/a equipo de ${empresa}:
    </p>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#334155">
      Nos complace confirmar su próxima reunión con VisionBI.
      A continuación encontrará los detalles de la cita agendada:
    </p>

    <!-- DETALLES -->
    <div style="background:#f8fafc;border:1px solid #cbd5e1;border-left:4px solid #1d4ed8;
                border-radius:4px;padding:20px 24px;margin-bottom:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;
                     color:#64748b;text-transform:uppercase;letter-spacing:1px;
                     padding-bottom:4px" colspan="2">Tipo de reunión</td>
        </tr>
        <tr>
          <td style="font-family:Georgia,serif;font-size:16px;color:#0f172a;font-weight:700;
                     padding-bottom:16px" colspan="2">${tipo_encuentro}</td>
        </tr>
        <tr>
          <td width="50%" style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;
                                  color:#64748b;text-transform:uppercase;letter-spacing:1px;
                                  padding-bottom:4px">Fecha</td>
          <td width="50%" style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;
                                  color:#64748b;text-transform:uppercase;letter-spacing:1px;
                                  padding-bottom:4px">Hora (Colombia)</td>
        </tr>
        <tr>
          <td style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;
                     font-weight:600;padding-bottom:0;text-transform:capitalize">${dateStr}</td>
          <td style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;
                     font-weight:600;padding-bottom:0">${timeRange}</td>
        </tr>
      </table>
    </div>

    ${meetBtn}
    ${divider}

    <!-- INSTRUCCIÓN ICS -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;
                padding:16px 20px;margin-bottom:24px">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;
                line-height:1.6;color:#14532d">
        <strong>Invitación al calendario adjunta.</strong><br>
        Encontrará adjunto el archivo <em>cita-visionbi.ics</em>.
        Al abrirlo o hacer clic en él, la cita se agregará automáticamente
        a Google Calendar, Outlook o Apple Calendar.
      </p>
    </div>

    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#475569">
      Si necesita modificar o cancelar esta cita, por favor contáctenos
      con al menos 24 horas de anticipación a través de:<br>
      <a href="mailto:info.visionbi@gmail.com" style="color:#1d4ed8;font-weight:600">
        info.visionbi@gmail.com
      </a>
    </p>

    ${divider}

    <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#334155;font-style:italic">
      Agradecemos su confianza en VisionBI.<br>
      Quedamos atentos a cualquier inquietud que pueda surgir.
    </p>
    <p style="margin:12px 0 0;font-family:Arial,sans-serif;font-size:13px;
              color:#0f172a;font-weight:600">
      Equipo VisionBI
    </p>

  </div>

  <!-- PIE -->
  <div style="background:#0f172a;padding:20px 40px;text-align:center">
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8">
      © 2025 VisionBI — Business Intelligence
    </p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#64748b">
      Este mensaje es de carácter confidencial y está dirigido exclusivamente a su destinatario.
    </p>
  </div>

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
    ? `<img src="${logoUrl}" alt="VisionBI" height="44"
            style="display:block;height:44px;max-height:44px;margin:0 auto 12px;object-fit:contain" />`
    : "";

  const row = (label: string, value: string) => `
    <tr>
      <td style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#64748b;
                 text-transform:uppercase;letter-spacing:0.8px;padding:8px 0 2px;
                 border-top:1px solid #e2e8f0;width:38%">${label}</td>
      <td style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b;
                 padding:8px 0 2px;border-top:1px solid #e2e8f0">${value}</td>
    </tr>`;

  const meetRow = meetLink
    ? row("Google Meet", `<a href="${meetLink}" style="color:#1d4ed8;word-break:break-all">${meetLink}</a>`)
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td>
<div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:8px;
            overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,0.07)">

  <!-- CABECERA -->
  <div style="background:#0f172a;padding:28px 40px;text-align:center">
    ${logoImg}
    <p style="margin:0;font-family:Georgia,serif;font-size:20px;font-weight:700;
              color:#ffffff;letter-spacing:0.5px">VisionBI</p>
    <p style="margin:5px 0 0;font-family:Arial,sans-serif;font-size:11px;
              color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase">
      Notificación Interna
    </p>
  </div>

  <!-- BANDA DE TÍTULO -->
  <div style="background:#4f46e5;padding:12px 40px;text-align:center">
    <p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#e0e7ff;letter-spacing:0.3px">
      Nueva Cita Registrada en el Sistema
    </p>
  </div>

  <!-- CUERPO -->
  <div style="padding:32px 40px;background:#ffffff">

    <!-- DETALLES DE LA REUNIÓN -->
    <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;
              color:#64748b;letter-spacing:1.2px;text-transform:uppercase">
      Detalles de la reunión
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #4f46e5;
                border-radius:4px;padding:4px 20px 12px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Tipo de reunión", `<strong>${tipo_encuentro}</strong>`)}
        ${row("Fecha", `<span style="text-transform:capitalize">${dateStr}</span>`)}
        ${row("Hora (Colombia)", timeRange)}
        ${meetRow}
      </table>
    </div>

    <div style="height:20px"></div>

    <!-- DATOS DEL CLIENTE -->
    <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;
              color:#64748b;letter-spacing:1.2px;text-transform:uppercase">
      Datos del cliente
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0ea5e9;
                border-radius:4px;padding:4px 20px 12px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row("Empresa", `<strong>${empresa}</strong>`)}
        ${row("Colaboradores", num_colaboradores)}
        ${row("NIT / Cédula", nit_cedula)}
        ${row("Correo", `<a href="mailto:${correo}" style="color:#1d4ed8">${correo}</a>`)}
        ${row("Teléfono", telefono)}
        ${row("Motivo", motivo)}
      </table>
    </div>

  </div>

  <!-- PIE -->
  <div style="background:#0f172a;padding:18px 40px;text-align:center">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8">
      © 2025 VisionBI — Uso interno exclusivo
    </p>
  </div>

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

    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .upsert(
        { empresa, nit_cedula, correo, telefono, updated_at: new Date().toISOString() },
        { onConflict: "correo" }
      ).select().single();
    if (clienteErr) throw clienteErr;

    // 2. Crear agendamiento
    const { data: agenda, error: agendaErr } = await supabase
      .from("agendamientos")
      .insert({ cliente_id: cliente.id, tipo_encuentro, motivo, fecha_inicio, fecha_fin })
      .select().single();
    if (agendaErr) throw agendaErr;

    // 3a. Crear Google Meet space (Meet REST API — funciona con Gmail personal)
    const meetScopes =
      "https://www.googleapis.com/auth/calendar " +
      "https://www.googleapis.com/auth/meetings.space.created";
    const accessToken = await getGoogleAccessToken(meetScopes);

    let meetLink = "";
    const meetRes = await fetch("https://meet.googleapis.com/v2/spaces", {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({}),
    });
    const meetData = await meetRes.json();
    if (meetRes.ok) {
      meetLink = meetData.meetingUri ?? "";
      console.log("[Meet] Space creado:", meetLink);
    } else {
      console.error("[Meet] Error:", JSON.stringify(meetData));
    }

    // 3b. Crear evento en Google Calendar (sin conferenceData — incluye Meet en descripción)
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID")!;
    const calDesc    = [
      `Empresa: ${empresa}`,
      `Colaboradores: ${num_colaboradores}`,
      `NIT/Cédula: ${nit_cedula}`,
      `Teléfono: ${telefono}`,
      `Correo: ${correo}`,
      `Motivo: ${motivo}`,
      meetLink ? `\nGoogle Meet: ${meetLink}` : "",
    ].filter(Boolean).join("\n");

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary:     `${tipo_encuentro} – ${empresa} | VisionBI`,
          description: calDesc,
          location:    meetLink || "Google Meet",
          start: { dateTime: fecha_inicio, timeZone: "America/Bogota" },
          end:   { dateTime: fecha_fin,    timeZone: "America/Bogota" },
        }),
      }
    );
    const eventData = await eventRes.json();

    let calendarStatus = "ok";
    if (!eventRes.ok) {
      calendarStatus = `error ${eventRes.status}: ${JSON.stringify(eventData)}`;
      console.error("[Calendar] Error:", calendarStatus);
    } else {
      console.log("[Calendar] Evento creado:", eventData.id);
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
    const logoUrl   = siteUrl ? `${siteUrl}/logo-visionbi.png` : "";
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
    const notifyEmail = Deno.env.get("NOTIFY_EMAIL");
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
