import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok  = (body: object) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fail = (msg: string) =>
  new Response(JSON.stringify({ success: false, error: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as {
      mode?: "set-password";
      nit_cedula: string;
      password: string;
      empresa?: string;
      correo?: string;
      telefono?: string;
      num_colaboradores?: string;
    };
    const { mode, nit_cedula, password } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Modo: solo contraseña para cliente ya registrado ────────────────────
    if (mode === "set-password") {
      const { data: clienteRow } = await supabase
        .from("clientes")
        .select("correo")
        .eq("nit_cedula", nit_cedula.trim())
        .maybeSingle();

      if (!clienteRow) return fail("NIT/Cédula no encontrado.");

      const { error: authError } = await supabase.auth.admin.createUser({
        email:         clienteRow.correo,
        password,
        email_confirm: true,
      });

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          return fail("Ya tienes una cuenta activa. Por favor inicia sesión en la pestaña de inicio de sesión.");
        }
        throw authError;
      }

      return ok({ success: true, correo: clienteRow.correo });
    }

    // ── Modo: registro completo (nuevo cliente) ──────────────────────────────
    const { empresa, correo, telefono, num_colaboradores } = body;

    const { data: existingByNit } = await supabase
      .from("clientes")
      .select("correo")
      .eq("nit_cedula", nit_cedula.trim())
      .maybeSingle();

    if (existingByNit && existingByNit.correo !== correo) {
      return fail("Este NIT/Cédula ya está registrado. Si eres tú, ingresa tu correo original o inicia sesión.");
    }

    const { error: authError } = await supabase.auth.admin.createUser({
      email:         correo!,
      password,
      email_confirm: true,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        return fail("Este correo ya tiene una cuenta activa. Por favor inicia sesión.");
      }
      throw authError;
    }

    const { error: clienteError } = await supabase
      .from("clientes")
      .upsert(
        {
          empresa,
          nit_cedula:        nit_cedula.trim(),
          correo,
          telefono,
          num_colaboradores: num_colaboradores ?? null,
          updated_at:        new Date().toISOString(),
        },
        { onConflict: "correo" }
      );
    if (clienteError) throw clienteError;

    return ok({ success: true });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "Error interno del servidor. Intenta de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
