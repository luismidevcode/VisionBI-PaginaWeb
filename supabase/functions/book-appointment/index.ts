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
  const payload = base64url(
    JSON.stringify({
      iss:   email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud:   "https://oauth2.googleapis.com/token",
      exp:   now + 3600,
      iat:   now,
    })
  );
  const signingInput = `${header}.${payload}`;

  const pemContent = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
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

// ─── Email HTML ───────────────────────────────────────────────────────────────

function buildEmailHtml(
  empresa:        string,
  tipo_encuentro: string,
  correo:         string,
  dateStr:        string,
  timeRange:      string
): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px">¡Tu cita está confirmada!</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">VisionBI – Business Intelligence</p>
      </div>
      <div style="padding:32px;background:#fff">
        <p style="color:#374151;font-size:16px">Hola <strong>${empresa}</strong>,</p>
        <p style="color:#374151">Tu cita ha sido agendada exitosamente. Aquí los detalles:</p>
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:24px;margin:24px 0">
          <p style="margin:8px 0;color:#0369a1">📋 <strong>Tipo:</strong> ${tipo_encuentro}</p>
          <p style="margin:8px 0;color:#0369a1">📅 <strong>Fecha:</strong> ${dateStr}</p>
          <p style="margin:8px 0;color:#0369a1">🕐 <strong>Hora:</strong> ${timeRange} (hora Colombia)</p>
        </div>
        <p style="color:#6b7280;font-size:14px">
          La invitación al calendario ha sido enviada a
          <strong>${correo}</strong>. Revisa tu correo y acepta la invitación para que aparezca en tu calendario.
        </p>
        <p style="color:#6b7280;font-size:14px">
          ¿Necesitas modificar o cancelar?
          Escríbenos a <a href="mailto:info.visionbi@gmail.com" style="color:#3b82f6">info.visionbi@gmail.com</a>
        </p>
      </div>
      <div style="background:#f9fafb;padding:16px;text-align:center">
        <p style="color:#9ca3af;font-size:12px;margin:0">© 2025 VisionBI. Todos los derechos reservados.</p>
      </div>
    </div>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as {
      tipo_encuentro: string;
      empresa:        string;
      nit_cedula:     string;
      correo:         string;
      telefono:       string;
      motivo:         string;
      fecha_inicio:   string;
      fecha_fin:      string;
    };
    const { tipo_encuentro, empresa, nit_cedula, correo, telefono, motivo, fecha_inicio, fecha_fin } = body;

    // 1. Upsert cliente en Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .upsert(
        { empresa, nit_cedula, correo, telefono, updated_at: new Date().toISOString() },
        { onConflict: "correo" }
      )
      .select()
      .single();

    if (clienteErr) throw clienteErr;

    // 2. Crear agendamiento en Supabase
    const { data: agenda, error: agendaErr } = await supabase
      .from("agendamientos")
      .insert({ cliente_id: cliente.id, tipo_encuentro, motivo, fecha_inicio, fecha_fin })
      .select()
      .single();

    if (agendaErr) throw agendaErr;

    // 3. Crear evento en Google Calendar (invita al cliente automáticamente)
    const calendarId  = Deno.env.get("GOOGLE_CALENDAR_ID")!;
    const accessToken = await getGoogleAccessToken();

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary:     `${tipo_encuentro} – ${empresa} | VisionBI`,
          description: `Empresa: ${empresa}\nNIT/Cédula: ${nit_cedula}\nTeléfono: ${telefono}\nMotivo: ${motivo}`,
          start:       { dateTime: fecha_inicio, timeZone: "America/Bogota" },
          end:         { dateTime: fecha_fin,    timeZone: "America/Bogota" },
          attendees:   [{ email: correo }],
        }),
      }
    );
    const eventData = await eventRes.json();

    // Guardar el ID del evento de Google
    if (eventData.id) {
      await supabase
        .from("agendamientos")
        .update({ google_event_id: eventData.id })
        .eq("id", agenda.id);
    }

    // 4. Enviar correo de confirmación al cliente vía Resend
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("FROM_EMAIL") ?? "citas@visionbi.co";

    const opts: Intl.DateTimeFormatOptions = {
      timeZone: "America/Bogota",
      weekday: "long",
      year:    "numeric",
      month:   "long",
      day:     "numeric",
    };
    const timeOpts: Intl.DateTimeFormatOptions = {
      timeZone: "America/Bogota",
      hour:   "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    const start    = new Date(fecha_inicio);
    const end      = new Date(fecha_fin);
    const dateStr  = start.toLocaleDateString("es-CO", opts);
    const timeRange = `${start.toLocaleTimeString("es-CO", timeOpts)} – ${end.toLocaleTimeString("es-CO", timeOpts)}`;

    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    `VisionBI <${fromEmail}>`,
        to:      [correo],
        subject: `✅ Cita confirmada: ${tipo_encuentro} – VisionBI`,
        html:    buildEmailHtml(empresa, tipo_encuentro, correo, dateStr, timeRange),
      }),
    });

    return new Response(
      JSON.stringify({ success: true, agendamiento_id: agenda.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status:  500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
