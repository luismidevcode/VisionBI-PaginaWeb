import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WORKING_START = 9;   // 9 AM Bogotá
const WORKING_END   = 18;  // 6 PM Bogotá
const LUNCH_HOUR    = 12;  // Bloque 12:00-13:00 excluido
const BOGOTA_TZ     = "-05:00";

// ─── Google Auth (JWT Service Account) ───────────────────────────────────────

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
  const pemContent   = pem
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

  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;

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

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { date } = await req.json() as { date: string };
    if (!date)
      return new Response(JSON.stringify({ error: "date required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const calendarId   = Deno.env.get("GOOGLE_CALENDAR_ID")!;
    const accessToken  = await getGoogleAccessToken();

    // Construir todos los bloques del día en horario Bogotá
    const allSlots: { start: string; end: string }[] = [];
    for (let h = WORKING_START; h < WORKING_END; h++) {
      if (h === LUNCH_HOUR) continue;
      allSlots.push({
        start: `${date}T${String(h).padStart(2, "0")}:00:00${BOGOTA_TZ}`,
        end:   `${date}T${String(h + 1).padStart(2, "0")}:00:00${BOGOTA_TZ}`,
      });
    }

    // Consultar freebusy en Google Calendar
    const fbRes  = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin:  allSlots[0].start,
          timeMax:  allSlots[allSlots.length - 1].end,
          timeZone: "America/Bogota",
          items:    [{ id: calendarId }],
        }),
      }
    );
    const fbData  = await fbRes.json();
    const busy: { start: string; end: string }[] =
      fbData.calendars?.[calendarId]?.busy ?? [];

    // Filtrar bloques ocupados
    const available = allSlots.filter((slot) => {
      const sStart = new Date(slot.start).getTime();
      const sEnd   = new Date(slot.end).getTime();
      return !busy.some((b) => {
        const bStart = new Date(b.start).getTime();
        const bEnd   = new Date(b.end).getTime();
        return sStart < bEnd && sEnd > bStart;
      });
    });

    return new Response(JSON.stringify({ slots: available }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status:  500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
