import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { empresa, nit_cedula, correo, telefono, password } =
      await req.json() as {
        empresa: string; nit_cedula: string; correo: string;
        telefono: string; password: string;
      };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Si el NIT ya existe con un correo diferente, rechazar
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

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:         correo,
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

    // Upsert en clientes (vincula diagnósticos previos si los hay)
    const { error: clienteError } = await supabase
      .from("clientes")
      .upsert(
        { empresa, nit_cedula: nit_cedula.trim(), correo, telefono, updated_at: new Date().toISOString() },
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
