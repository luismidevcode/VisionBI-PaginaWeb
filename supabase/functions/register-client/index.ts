import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok   = (body: object) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fail = (msg: string) =>
  new Response(JSON.stringify({ success: false, error: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function serverSignIn(email: string, password: string) {
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
  const { data } = await anon.auth.signInWithPassword({ email, password });
  return data?.session ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as {
      mode?: "new-user";
      nit_cedula: string;
      correo: string;
      password: string;
    };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { nit_cedula, correo, password } = body;

    // 1. Buscar empresa por NIT
    const { data: clienteRow } = await admin
      .from("clientes")
      .select("id, empresa, correo")
      .eq("nit_cedula", nit_cedula.trim())
      .maybeSingle();

    if (!clienteRow) {
      return fail("NIT/Cédula no encontrado. Tu empresa debe estar registrada en VisionBI primero.");
    }

    // 2. Crear usuario en Auth con el correo del usuario
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email:         correo.toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        return fail("Este correo ya tiene una cuenta. Por favor inicia sesión.");
      }
      throw authError;
    }

    const userId = authData.user!.id;

    // 3. Determinar rol: owner si no hay usuarios activos, pending/viewer si ya hay
    const { count } = await admin
      .from("empresa_usuarios")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", clienteRow.id)
      .eq("status", "active");

    const isFirstUser = (count ?? 0) === 0;

    const { error: euError } = await admin.from("empresa_usuarios").insert({
      cliente_id:        clienteRow.id,
      user_id:           userId,
      correo_usuario:    correo.toLowerCase(),
      role:              isFirstUser ? "owner" : "viewer",
      can_book_sessions: isFirstUser,
      can_view_projects: true,
      can_view_sessions: isFirstUser,
      can_edit_company:  isFirstUser,
      status:            isFirstUser ? "active" : "pending",
    });

    if (euError) throw euError;

    // 4. Si es owner: devolver sesión directamente
    if (isFirstUser) {
      const session = await serverSignIn(correo.toLowerCase(), password);
      return ok({
        success:       true,
        pending:       false,
        access_token:  session?.access_token  ?? null,
        refresh_token: session?.refresh_token ?? null,
      });
    }

    // 5. Si es pendiente: notificar sin sesión
    return ok({
      success:  true,
      pending:  true,
      empresa:  clienteRow.empresa,
    });

  } catch (err) {
    console.error("[register-client] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Error interno del servidor. Intenta de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
