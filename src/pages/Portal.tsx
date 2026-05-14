import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn, UserPlus, AlertCircle } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/lib/supabase";

// ─── Esquemas ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  nit_cedula: z.string().min(5, "Ingresa tu NIT o cédula"),
  password:   z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const registerSchema = z.object({
  empresa:           z.string().min(2, "Ingresa el nombre de tu empresa"),
  nit_cedula:        z.string().min(5, "Ingresa el NIT o cédula sin dígito de verificación"),
  correo:            z.string().email("Correo electrónico inválido"),
  telefono:          z.string().min(7, "Ingresa un teléfono válido"),
  password:          z.string().min(8, "Mínimo 8 caracteres"),
  confirm_password:  z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Las contraseñas no coinciden",
  path:    ["confirm_password"],
});

type LoginValues    = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

// ─── Componente ───────────────────────────────────────────────────────────────

const Portal = () => {
  const navigate = useNavigate();
  const [tab,         setTab]         = useState<"login" | "register">("login");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const loginForm = useForm<LoginValues>({
    resolver:      zodResolver(loginSchema),
    defaultValues: { nit_cedula: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver:      zodResolver(registerSchema),
    defaultValues: { empresa: "", nit_cedula: "", correo: "", telefono: "", password: "", confirm_password: "" },
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  const onLogin = async (values: LoginValues) => {
    setLoading(true);
    setError(null);
    try {
      const { data: lookupData, error: lookupError } = await supabase.functions.invoke<{ correo: string }>(
        "lookup-nit",
        { body: { nit_cedula: values.nit_cedula } }
      );
      if (lookupError || !lookupData?.correo) {
        setError("NIT/Cédula no encontrado. Verifica el número o regístrate.");
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    lookupData.correo,
        password: values.password,
      });
      if (authError) {
        setError("Contraseña incorrecta. Intenta de nuevo.");
        return;
      }

      navigate("/portal/dashboard");
    } catch {
      setError("Error al iniciar sesión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // ── Registro ───────────────────────────────────────────────────────────────

  const onRegister = async (values: RegisterValues) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: regError } = await supabase.functions.invoke<{ success: boolean }>(
        "register-client",
        { body: {
          empresa:    values.empresa,
          nit_cedula: values.nit_cedula,
          correo:     values.correo,
          telefono:   values.telefono,
          password:   values.password,
        } }
      );

      if (regError || !data?.success) {
        const msg = (regError as { message?: string })?.message
          ?? "Error al registrarse. Intenta de nuevo.";
        setError(msg);
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    values.correo,
        password: values.password,
      });
      if (authError) {
        setError("Cuenta creada. Por favor inicia sesión.");
        setTab("login");
        return;
      }

      navigate("/portal/dashboard");
    } catch {
      setError("Error al registrarse. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/Logo.jpg"
            alt="VisionBI"
            className="h-16 mx-auto object-contain mb-3"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <p className="text-slate-500 text-sm">Portal de Clientes</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-slate-200">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                className={`py-3.5 text-sm font-semibold transition-colors ${
                  tab === t
                    ? "text-[#1a3461] border-b-2 border-[#1a3461] bg-white"
                    : "text-slate-400 hover:text-slate-600 bg-slate-50"
                }`}
              >
                {t === "login" ? (
                  <span className="flex items-center justify-center gap-2">
                    <LogIn className="h-4 w-4" /> Iniciar sesión
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <UserPlus className="h-4 w-4" /> Registrarse
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-7">

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* ── Formulario Login ── */}
            {tab === "login" && (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="nit_cedula"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NIT / Cédula</FormLabel>
                        <FormControl>
                          <Input placeholder="900123456" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPass ? "text" : "password"}
                              placeholder="••••••••"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPass((p) => !p)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-[#1a3461] hover:bg-[#15294f] text-white mt-2"
                    disabled={loading}
                  >
                    {loading ? "Ingresando..." : "Ingresar"}
                  </Button>
                </form>
              </Form>
            )}

            {/* ── Formulario Registro ── */}
            {tab === "register" && (
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                  <FormField
                    control={registerForm.control}
                    name="empresa"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empresa</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre de tu empresa" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="nit_cedula"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NIT / Cédula</FormLabel>
                        <FormControl>
                          <Input placeholder="900123456" {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Solo el número, sin dígito de verificación.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="correo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Correo electrónico</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="tu@empresa.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="telefono"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="300 000 0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPass ? "text" : "password"}
                              placeholder="Mínimo 8 caracteres"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPass((p) => !p)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="confirm_password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar contraseña</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirm ? "text" : "password"}
                              placeholder="Repite tu contraseña"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirm((p) => !p)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-[#1a3461] hover:bg-[#15294f] text-white mt-2"
                    disabled={loading}
                  >
                    {loading ? "Creando cuenta..." : "Crear cuenta"}
                  </Button>
                </form>
              </Form>
            )}

          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © 2025 VisionBI — Technology · Data Analytics
        </p>
      </div>
    </div>
  );
};

export default Portal;
