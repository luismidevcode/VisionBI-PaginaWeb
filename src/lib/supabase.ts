import { createClient } from "@supabase/supabase-js";

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[VisionBI] Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. " +
    "Agrégalas en el panel de Vercel → Settings → Environment Variables."
  );
}

export const supabase = createClient(
  supabaseUrl  ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder"
);
