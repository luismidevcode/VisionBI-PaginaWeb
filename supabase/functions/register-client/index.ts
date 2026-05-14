import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // ── Modo: solo crear contraseña para cliente ya registrado ──────────────
    if (mode === "set-password") {
      const { data: clienteRow } = await supabase
        .from("clientes")
        .select("correo")
        .eq("nit_cedula", nit_cedula.trim())
        .maybeSingle();

      if (!clienteRow) {
        return new Response(
          JSON.stringify({ error: "NIT/Cédula no encontrado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: authError } = await supabase.auth.admin.createUser({
        email:         clienteRow.correo,
        password,
        email_confirm: true,
      });

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          return new Response(
            JSON.stringify({ error: "Ya tienes una cuenta activa. Por favor inicia sesión." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw authError;
      }

      return new Response(
        JSON.stringify({ success: true, correo: clienteRow.correo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Modo: registro completo (nuevo cliente) ──────────────────────────────
    const { empresa, correo, telefono, num_colaboradores } = body;

    // Si el NIT ya existe con otro correo, rechazar
    const { data: existingByNit } = await supabase
      .from("clientes")
      .select("correo")
      .eq("nit_cedula", nit_cedula.trim())
      .maybeSingle();

    if (existingByNit && existingByNit.correo !== correo) {
      return new Response(
        JSON.stringify({ error: "Este NIT/Cédula ya está registrado con otro correo electrónico." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: authError } = await supabase.auth.admin.createUser({
      email:         correo!,
      password,
      email_confirm: true,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        return new Response(
          JSON.stringify({ error: "Este correo ya tiene una cuenta. Por favor inicia sesión." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
