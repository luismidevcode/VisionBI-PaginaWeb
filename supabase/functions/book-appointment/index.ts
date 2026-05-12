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

async function getGoogleAccessToken(): Promise<string> {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
  const pem   = Deno.env.get("GOOGLE_PRIVATE_KEY")!.replace(/\\n/g, "\n");
  const now   = Math.floor(Date.now() / 1000);

  const header  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss:   email,
    scope: "https://www.googleapis.com/auth/calendar",
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
  dateStr: string, timeRange: string, meetLink: string
): string {
  const meetSection = meetLink ? `
      <div style="text-align:center;margin:24px 0">
        <a href="${meetLink}" target="_blank"
           style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#8b5cf6);
                  color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;
                  font-weight:600;font-size:15px">
          🎥 Unirse a Google Meet
        </a>
        <p style="margin:8px 0 0;color:#6b7280;font-size:12px">
          O copia el enlace: <a href="${meetLink}" style="color:#3b82f6">${meetLink}</a>
        </p>
      </div>` : "";

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px">¡Tu cita está confirmada!</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">VisionBI – Business Intelligence</p>
    </div>
    <div style="padding:32px;background:#fff">
      <p style="color:#374151;font-size:16px">Hola <strong>${empresa}</strong>,</p>
      <p style="color:#374151">Tu cita ha sido agendada. Aquí los detalles:</p>
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:24px;margin:24px 0">
        <p style="margin:8px 0;color:#0369a1">📋 <strong>Tipo:</strong> ${tipo_encuentro}</p>
        <p style="margin:8px 0;color:#0369a1">📅 <strong>Fecha:</strong> ${dateStr}</p>
        <p style="margin:8px 0;color:#0369a1">🕐 <strong>Hora:</strong> ${timeRange} (hora Colombia)</p>
      </div>
      ${meetSection}
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:24px">
        <p style="margin:0;color:#166534;font-size:14px">
          📎 <strong>Adjunto encontrarás el archivo de invitación al calendario.</strong><br>
          Ábrelo o haz clic en él para agregarlo automáticamente a Google Calendar,
          Outlook o Apple Calendar.
        </p>
      </div>
      <p style="color:#6b7280;font-size:14px">
        ¿Necesitas modificar o cancelar? Escríbenos a
        <a href="mailto:info.visionbi@gmail.com" style="color:#3b82f6">info.visionbi@gmail.com</a>
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center">
      <p style="color:#9ca3af;font-size:12px;margin:0">© 2025 VisionBI. Todos los derechos reservados.</p>
    </div>
  </div>`;
}

// ─── Email interno ────────────────────────────────────────────────────────────

function buildInternalEmailHtml(
  empresa: string, nit_cedula: string, correo: string, telefono: string,
  num_colaboradores: string, tipo_encuentro: string, motivo: string,
  dateStr: string, timeRange: string, meetLink: string
): string {
  const meetSection = meetLink ? `
        <p style="margin:8px 0;color:#374151">🎥 <strong>Meet:</strong>
          <a href="${meetLink}" style="color:#3b82f6">${meetLink}</a>
        </p>` : "";

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:linear-gradient(135deg,#1e40af,#6d28d9);padding:28px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">📅 Nueva cita agendada</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">VisionBI – Notificación interna</p>
    </div>
    <div style="padding:32px;background:#fff">
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:24px;margin-bottom:24px">
        <p style="margin:8px 0;color:#0369a1">📋 <strong>Tipo:</strong> ${tipo_encuentro}</p>
        <p style="margin:8px 0;color:#0369a1">📅 <strong>Fecha:</strong> ${dateStr}</p>
        <p style="margin:8px 0;color:#0369a1">🕐 <strong>Hora:</strong> ${timeRange} (hora Colombia)</p>
        ${meetSection}
      </div>
      <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
        <h3 style="margin:0 0 16px;color:#111827;font-size:15px">Datos del cliente</h3>
        <p style="margin:8px 0;color:#374151">🏢 <strong>Empresa:</strong> ${empresa}</p>
        <p style="margin:8px 0;color:#374151">👥 <strong>Colaboradores:</strong> ${num_colaboradores}</p>
        <p style="margin:8px 0;color:#374151">🪪 <strong>NIT / Cédula:</strong> ${nit_cedula}</p>
        <p style="margin:8px 0;color:#374151">📧 <strong>Correo:</strong> ${correo}</p>
        <p style="margin:8px 0;color:#374151">📱 <strong>Teléfono:</strong> ${telefono}</p>
        <p style="margin:8px 0;color:#374151">💬 <strong>Motivo:</strong> ${motivo}</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center">
      <p style="color:#9ca3af;font-size:12px;margin:0">© 2025 VisionBI – Uso interno</p>
    </div>
  </div>`;
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

    // 3. Crear evento en Google Calendar con Google Meet
    const calendarId  = Deno.env.get("GOOGLE_CALENDAR_ID")!;
    const accessToken = await getGoogleAccessToken();

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary:     `${tipo_encuentro} – ${empresa} | VisionBI`,
          description: `Empresa: ${empresa}\nColaboradores: ${num_colaboradores}\nNIT/Cédula: ${nit_cedula}\nTeléfono: ${telefono}\nCorreo: ${correo}\nMotivo: ${motivo}`,
          start: { dateTime: fecha_inicio, timeZone: "America/Bogota" },
          end:   { dateTime: fecha_fin,    timeZone: "America/Bogota" },
          conferenceData: {
            createRequest: {
              requestId:            agenda.id,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      }
    );
    const eventData = await eventRes.json();

    let calendarStatus = "ok";
    let meetLink       = "";

    if (!eventRes.ok) {
      calendarStatus = `error ${eventRes.status}: ${JSON.stringify(eventData)}`;
      console.error("[Calendar] Error:", calendarStatus);
    } else {
      console.log("[Calendar] Evento creado:", eventData.id);
      meetLink = eventData.hangoutLink ?? eventData.conferenceData?.entryPoints?.[0]?.uri ?? "";
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
        html:        buildClientEmailHtml(empresa, tipo_encuentro, dateStr, timeRange, meetLink),
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
                         dateStr, timeRange, meetLink
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
