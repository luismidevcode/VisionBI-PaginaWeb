import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── OAuth (mismo patrón que book-appointment) ────────────────────────────────

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
  uid: string; summary: string; description: string; location: string;
  startISO: string; endISO: string; organizer: string; attendee: string;
}): string {
  const toUTC = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//VisionBI//Business Intelligence//ES",
    "CALSCALE:GREGORIAN", "METHOD:REQUEST",
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
    "STATUS:CONFIRMED", "SEQUENCE:0",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function icsToBase64(ics: string): string {
  const bytes = new TextEncoder().encode(ics);
  return btoa(String.fromCharCode(...bytes));
}

// ─── Email ───────────────────────────────────────────────────────────────────

function buildSessionEmailHtml(
  empresa: string, proyecto: string, tipo_sesion: string,
  dateStr: string, timeRange: string, meetLink: string, logoUrl: string
): string {
  const logoImg = logoUrl
    ? `<img src="${logoUrl}" alt="VisionBI" height="64"
            style="display:block;height:64px;max-height:64px;margin:0 auto;object-fit:contain" />`
    : `<p style="margin:0;font-family:Arial,sans-serif;font-size:24px;font-weight:900;
                color:#1a3461">Vision<span style="color:#00b8d9">BI</span></p>`;

  const meetBtn = meetLink ? `
    <div style="text-align:center;margin:24px 0 16px">
      <a href="${meetLink}" target="_blank"
         style="display:inline-block;background:#1a3461;color:#fff;padding:13px 32px;
                border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;
                font-weight:700;font-size:14px;letter-spacing:0.5px">
        Unirse a la reunión — Google Meet
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
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;
            border:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,.07)">
  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:5px"></div>
  <div style="background:#fff;padding:28px 40px 24px;text-align:center;border-bottom:1px solid #e2e8f0">
    ${logoImg}
  </div>
  <div style="background:#1a3461;padding:13px 40px;text-align:center">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:600;
              color:#a8c4e8;letter-spacing:2px;text-transform:uppercase">Sesión Confirmada</p>
  </div>
  <div style="padding:36px 40px;background:#fff">
    <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:15px;color:#1a3461;font-weight:700">
      Estimado/a equipo de ${empresa}:
    </p>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155">
      Su sesión de proyecto ha sido confirmada. A continuación los detalles:
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #00b8d9;
                border-radius:4px;padding:20px 24px;margin-bottom:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td colspan="2" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                     color:#64748b;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:4px">
            Proyecto
          </td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:Arial,sans-serif;font-size:16px;color:#1a3461;
                     font-weight:700;padding-bottom:18px">${proyecto}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                     color:#64748b;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:4px">
            Tipo de sesión
          </td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;
                     font-weight:600;padding-bottom:18px">${tipo_sesion}</td>
        </tr>
        <tr>
          <td width="50%" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                      color:#64748b;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:4px">
            Fecha
          </td>
          <td width="50%" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                      color:#64748b;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:4px">
            Hora (Colombia)
          </td>
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
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;
                border-radius:4px;padding:14px 18px;margin-bottom:24px">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#14532d">
        <strong>Invitación al calendario adjunta.</strong><br>
        El archivo <em>sesion-visionbi.ics</em> le permite agregar esta sesión a su calendario.
      </p>
    </div>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#334155;line-height:1.7">
      Agradecemos su confianza en VisionBI.<br>
      Quedamos atentos a cualquier inquietud.
    </p>
    <p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#1a3461;font-weight:700">
      Equipo VisionBI<br>
      <span style="font-weight:400;color:#00b8d9;font-size:12px">Technology · Data Analytics</span>
    </p>
  </div>
  <div style="background:#1a3461;padding:18px 40px;text-align:center">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#a8c4e8">
      © 2025 VisionBI — Technology · Data Analytics
    </p>
  </div>
  <div style="background:linear-gradient(90deg,#1a3461 0%,#00b8d9 100%);height:3px"></div>
</div>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Verificar autenticación
    const authHeader = req.headers.get("Authorization");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      proyecto_id: string; tipo_sesion: string; motivo: string;
      fecha_inicio: string; fecha_fin: string;
    };
    const { proyecto_id, tipo_sesion, motivo, fecha_inicio, fecha_fin } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Obtener cliente y proyecto
    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .select("id, empresa, correo, telefono")
      .eq("correo", user.email!)
      .single();
    if (clienteErr || !cliente) throw new Error("Cliente no encontrado");

    const { data: proyecto, error: proyectoErr } = await supabase
      .from("proyectos")
      .select("id, nombre")
      .eq("id", proyecto_id)
      .eq("cliente_id", cliente.id)
      .single();
    if (proyectoErr || !proyecto) throw new Error("Proyecto no encontrado o no autorizado");

    // 3. Crear registro de sesión
    const { data: sesion, error: sesionErr } = await supabase
      .from("sesiones_proyecto")
      .insert({ proyecto_id, tipo_sesion, motivo, fecha_inicio, fecha_fin })
      .select()
      .single();
    if (sesionErr) throw sesionErr;

    // 4. Crear Calendar event con Meet
    const accessToken   = await getOAuthAccessToken();
    const calendarId    = Deno.env.get("GOOGLE_CALENDAR_ID")!;
    const notifyEmail   = Deno.env.get("NOTIFY_EMAIL") ?? "";
    const attendees     = [
      { email: cliente.correo },
      ...(notifyEmail ? [{ email: notifyEmail }] : []),
    ];

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary:     `${tipo_sesion} – ${proyecto.nombre} | ${cliente.empresa}`,
          description: `Proyecto: ${proyecto.nombre}\nEmpresa: ${cliente.empresa}\nMotivo: ${motivo}`,
          start:       { dateTime: fecha_inicio, timeZone: "America/Bogota" },
          end:         { dateTime: fecha_fin,    timeZone: "America/Bogota" },
          attendees,
          conferenceData: {
            createRequest: {
              requestId:             sesion.id,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      }
    );
    const eventData = await eventRes.json();

    let meetLink = "";
    if (eventRes.ok) {
      const videoEntry = (eventData.conferenceData?.entryPoints ?? [])
        .find((e: { entryPointType: string; uri: string }) => e.entryPointType === "video");
      meetLink = videoEntry?.uri
        ?? (eventData.conferenceData?.conferenceId
          ? `https://meet.google.com/${eventData.conferenceData.conferenceId}`
          : "");
      await supabase.from("sesiones_proyecto")
        .update({ google_event_id: eventData.id, meet_link: meetLink })
        .eq("id", sesion.id);
    }

    // 5. Enviar correos
    const fromEmail  = Deno.env.get("FROM_EMAIL") ?? "agenda.visionbi@gmail.com";
    const resendKey  = Deno.env.get("RESEND_API_KEY")!;
    const siteUrl    = Deno.env.get("SITE_URL") ?? "";
    const logoUrl    = siteUrl ? `${siteUrl}/Logo.jpg` : "";
    const dateStr    = new Date(fecha_inicio).toLocaleDateString("es-CO", {
      timeZone: "America/Bogota", weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const timeOpts: Intl.DateTimeFormatOptions = {
      timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: true,
    };
    const timeRange = `${new Date(fecha_inicio).toLocaleTimeString("es-CO", timeOpts)} – ${new Date(fecha_fin).toLocaleTimeString("es-CO", timeOpts)}`;

    const icsContent = generateICS({
      uid:         sesion.id,
      summary:     `${tipo_sesion} – ${proyecto.nombre} | VisionBI`,
      description: `Proyecto: ${proyecto.nombre} | Motivo: ${motivo}${meetLink ? `\nMeet: ${meetLink}` : ""}`,
      location:    meetLink || "Google Meet",
      startISO:    fecha_inicio,
      endISO:      fecha_fin,
      organizer:   fromEmail,
      attendee:    cliente.correo,
    });

    const attachment = {
      filename:     "sesion-visionbi.ics",
      content:      icsToBase64(icsContent),
      content_type: "text/calendar; method=REQUEST",
    };

    const emailHtml = buildSessionEmailHtml(
      cliente.empresa, proyecto.nombre, tipo_sesion, dateStr, timeRange, meetLink, logoUrl
    );

    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:        `VisionBI <${fromEmail}>`,
        to:          [cliente.correo],
        subject:     `✅ Sesión confirmada: ${tipo_sesion} – ${proyecto.nombre}`,
        html:        emailHtml,
        attachments: [attachment],
      }),
    });

    if (notifyEmail) {
      await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:    `VisionBI <${fromEmail}>`,
          to:      [notifyEmail],
          subject: `📅 Nueva sesión: ${tipo_sesion} – ${proyecto.nombre} (${cliente.empresa})`,
          html:    `<p>Proyecto: <b>${proyecto.nombre}</b><br>Empresa: <b>${cliente.empresa}</b><br>Tipo: ${tipo_sesion}<br>Fecha: ${dateStr}<br>Hora: ${timeRange}<br>Motivo: ${motivo}${meetLink ? `<br>Meet: <a href="${meetLink}">${meetLink}</a>` : ""}</p>`,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, sesion_id: sesion.id, meet_link: meetLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[book-session]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
