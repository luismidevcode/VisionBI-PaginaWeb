import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WORKING_START = 9;   // 9 AM Bogotá
const WORKING_END   = 18;  // 6 PM Bogotá
const LUNCH_HOUR    = 12;  // 12:00-13:00 excluido
const BOGOTA_TZ     = "-05:00";
const MIN_DAYS_AHEAD = 7;  // reservas mínimo 7 días en adelante

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

  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFree(
  slotStartMs: number, slotEndMs: number,
  busy: { start: string; end: string }[]
): boolean {
  return !busy.some((b) => {
    const bStart = new Date(b.start).getTime();
    const bEnd   = new Date(b.end).getTime();
    return slotStartMs < bEnd && slotEndMs > bStart;
  });
}

function dayHasSlots(dateStr: string, busy: { start: string; end: string }[]): boolean {
  for (let h = WORKING_START; h < WORKING_END; h++) {
    if (h === LUNCH_HOUR) continue;
    const sMs = new Date(`${dateStr}T${String(h).padStart(2, "0")}:00:00${BOGOTA_TZ}`).getTime();
    const eMs = new Date(`${dateStr}T${String(h + 1).padStart(2, "0")}:00:00${BOGOTA_TZ}`).getTime();
    if (isFree(sMs, eMs, busy)) return true;
  }
  return false;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as { date?: string; month?: string };
    const calendarId  = Deno.env.get("GOOGLE_CALENDAR_ID")!;
    const accessToken = await getGoogleAccessToken();

    // ── Modo mes: devuelve qué días tienen al menos un slot libre ─────────────
    if (body.month) {
      const [year, monthNum] = body.month.split("-").map(Number);

      const minDate = new Date();
      minDate.setDate(minDate.getDate() + MIN_DAYS_AHEAD);
      minDate.setHours(0, 0, 0, 0);

      const firstOfMonth = new Date(year, monthNum - 1, 1);
      const lastOfMonth  = new Date(year, monthNum, 0);

      // Colectar días hábiles (L-V) dentro del mes que pasen el mínimo
      const workingDays: string[] = [];
      const cur = new Date(Math.max(firstOfMonth.getTime(), minDate.getTime()));
      while (cur <= lastOfMonth) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          const mm = String(cur.getMonth() + 1).padStart(2, "0");
          const dd = String(cur.getDate()).padStart(2, "0");
          workingDays.push(`${cur.getFullYear()}-${mm}-${dd}`);
        }
        cur.setDate(cur.getDate() + 1);
      }

      if (workingDays.length === 0) {
        return new Response(JSON.stringify({ availableDays: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Una sola consulta freebusy para todo el mes
      const timeMin = `${workingDays[0]}T${String(WORKING_START).padStart(2, "0")}:00:00${BOGOTA_TZ}`;
      const timeMax = `${workingDays[workingDays.length - 1]}T${String(WORKING_END).padStart(2, "0")}:00:00${BOGOTA_TZ}`;

      const fbRes  = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin, timeMax,
          timeZone: "America/Bogota",
          items: [{ id: calendarId }],
        }),
      });
      const fbData = await fbRes.json();
      const busy: { start: string; end: string }[] =
        fbData.calendars?.[calendarId]?.busy ?? [];

      const availableDays = workingDays.filter((d) => dayHasSlots(d, busy));
      return new Response(JSON.stringify({ availableDays }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Modo día: devuelve slots disponibles para una fecha ───────────────────
    const { date } = body;
    if (!date)
      return new Response(JSON.stringify({ error: "date or month required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const allSlots: { start: string; end: string }[] = [];
    for (let h = WORKING_START; h < WORKING_END; h++) {
      if (h === LUNCH_HOUR) continue;
      allSlots.push({
        start: `${date}T${String(h).padStart(2, "0")}:00:00${BOGOTA_TZ}`,
        end:   `${date}T${String(h + 1).padStart(2, "0")}:00:00${BOGOTA_TZ}`,
      });
    }

    const fbRes  = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin:  allSlots[0].start,
        timeMax:  allSlots[allSlots.length - 1].end,
        timeZone: "America/Bogota",
        items:    [{ id: calendarId }],
      }),
    });
    const fbData = await fbRes.json();
    const busy: { start: string; end: string }[] =
      fbData.calendars?.[calendarId]?.busy ?? [];

    const available = allSlots.filter((slot) =>
      isFree(new Date(slot.start).getTime(), new Date(slot.end).getTime(), busy)
    );

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
