import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn, UserPlus, AlertCircle, CheckCircle2, ChevronLeft, Clock } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/lib/supabase";

// ─── Esquemas ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  correo:   z.string().email("Ingresa un correo electrónico válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const registerSchema = z.object({
  correo:          z.string().email("Correo electrónico inválido"),
  password:        z.string().min(8, "Mínimo 8 caracteres"),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Las contraseñas no coinciden",
  path:    ["confirm_password"],
});

type LoginValues    = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

type RegStage = "nit" | "data" | "pending";

// ─── Componente ───────────────────────────────────────────────────────────────

const Portal = () => {
  const navigate = useNavigate();
  const [tab,         setTab]         = useState<"login" | "register">("login");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Estado del flujo de registro
  const [regStage,    setRegStage]    = useState<RegStage>("nit");
  const [regNit,      setRegNit]      = useState("");
  const [regNitError, setRegNitError] = useState<string | null>(null);
  const [regChecking, setRegChecking] = useState(false);
  const [regEmpresa,  setRegEmpresa]  = useState("");
  const [pendingMsg,  setPendingMsg]  = useState("");

  // ── Formularios ────────────────────────────────────────────────────────────

  const loginForm = useForm<LoginValues>({
    resolver:      zodResolver(loginSchema),
    defaultValues: { correo: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver:      zodResolver(registerSchema),
    defaultValues: { correo: "", password: "", confirm_password: "" },
  });

  // ── Cambio de pestaña ──────────────────────────────────────────────────────

  const handleTabChange = (t: "login" | "register") => {
    setTab(t);
    setError(null);
    if (t === "register") {
      setRegStage("nit");
      setRegNit("");
      setRegNitError(null);
      setRegEmpresa("");
      setShowPass(false);
      setShowConfirm(false);
      registerForm.reset();
    }
  };

  // ── Login (email + contraseña) ─────────────────────────────────────────────

  const onLogin = async (values: LoginValues) => {
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    values.correo.toLowerCase(),
        password: values.password,
      });
      if (authError) {
        setError("Credenciales incorrectas. Verifica tu correo y contraseña.");
        return;
      }

      // Verificar que el usuario tenga empresa_usuario activo
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Error al iniciar sesión."); return; }

      const { data: eu, error: euError } = await supabase
        .from("empresa_usuarios")
        .select("status")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (euError) {
        console.error("[Portal] empresa_usuarios query error:", euError);
      }
      console.log("[Portal] empresa_usuarios row:", eu, "uid:", session.user.id);

      if (!eu) {
        await supabase.auth.signOut();
        setError("Tu cuenta no está asociada a ninguna empresa. Regístrate primero.");
        return;
      }
      if (eu.status === "pending") {
        await supabase.auth.signOut();
        setError("Tu cuenta está pendiente de aprobación. Contacta a tu administrador o a VisionBI.");
        return;
      }
      if (eu.status === "disabled") {
        await supabase.auth.signOut();
        setError("Tu cuenta ha sido deshabilitada. Contacta a VisionBI.");
        return;
      }

      navigate("/portal/dashboard");
    } catch {
      setError("Error al iniciar sesión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // ── Registro paso 1: verificar NIT ────────────────────────────────────────

  const handleNitCheck = async () => {
    const nit = regNit.trim();
    if (nit.length < 5) {
      setRegNitError("Ingresa el NIT o cédula (mínimo 5 caracteres)");
      return;
    }
    setRegChecking(true);
    setRegNitError(null);
    try {
      const { data } = await supabase
        .from("clientes")
        .select("empresa")
        .eq("nit_cedula", nit)
        .maybeSingle();

      if (!data) {
        setRegNitError("NIT/Cédula no encontrado. Tu empresa debe estar registrada en VisionBI primero.");
        return;
      }
      setRegEmpresa(data.empresa);
      setRegStage("data");
    } catch {
      setRegNitError("Error al verificar. Intenta de nuevo.");
    } finally {
      setRegChecking(false);
    }
  };

  // ── Registro paso 2: datos del usuario ───────────────────────────────────

  const onRegister = async (values: RegisterValues) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        success: boolean; error?: string; pending?: boolean; empresa?: string;
        access_token?: string; refresh_token?: string;
      }>("register-client", {
        body: {
          nit_cedula: regNit.trim(),
          correo:     values.correo,
          password:   values.password,
        },
      });

      if (fnError || !data?.success) {
        setError(data?.error ?? "Error al crear la cuenta.");
        return;
      }

      if (data.pending) {
        setPendingMsg(data.empresa ?? regEmpresa);
        setRegStage("pending");
        return;
      }

      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        navigate("/portal/dashboard");
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: values.correo, password: values.password,
      });
      if (!authError) { navigate("/portal/dashboard"); return; }
      setError("Cuenta creada. Por favor inicia sesión.");
      handleTabChange("login");
    } catch {
      setError("Error al crear la cuenta. Intenta de nuevo.");
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

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-slate-200">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleTabChange(t)}
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

            {/* ── Login ── */}
            {tab === "login" && (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
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

            {/* ── Registro ── */}
            {tab === "register" && (
              <div className="space-y-5">

                {/* Paso 1: verificar NIT */}
                {regStage === "nit" && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500">
                      Ingresa el NIT de tu empresa para verificar que está registrada en VisionBI.
                    </p>
                    <div className="space-y-1.5">
                      <Label>NIT / Cédula</Label>
                      <Input
                        placeholder="900123456"
                        value={regNit}
                        onChange={(e) => setRegNit(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleNitCheck()}
                      />
                      <p className="text-xs text-muted-foreground">Sin dígito de verificación.</p>
                      {regNitError && (
                        <div className="flex items-center gap-2 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          {regNitError}
                        </div>
                      )}
                    </div>
                    <Button
                      className="w-full bg-[#1a3461] hover:bg-[#15294f] text-white"
                      onClick={handleNitCheck}
                      disabled={regChecking}
                    >
                      {regChecking ? "Verificando..." : "Continuar"}
                    </Button>
                  </div>
                )}

                {/* Paso 2: datos del usuario */}
                {regStage === "data" && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-[#1a3461] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-[#1a3461]">{regEmpresa}</p>
                        <p className="text-sm text-slate-600 mt-0.5">Empresa encontrada. Crea tu acceso personal.</p>
                      </div>
                    </div>

                    <Form {...registerForm}>
                      <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                        <FormField
                          control={registerForm.control}
                          name="correo"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tu correo electrónico</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="tu@empresa.com" {...field} />
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
                        <div className="flex gap-3 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setRegStage("nit")}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
                          </Button>
                          <Button
                            type="submit"
                            className="flex-1 bg-[#1a3461] hover:bg-[#15294f] text-white"
                            disabled={loading}
                          >
                            {loading ? "Creando..." : "Crear acceso"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>
                )}

                {/* Paso 3: pendiente de aprobación */}
                {regStage === "pending" && (
                  <div className="space-y-4 text-center">
                    <div className="flex justify-center">
                      <div className="bg-amber-50 border border-amber-200 rounded-full p-4">
                        <Clock className="h-8 w-8 text-amber-500" />
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-[#1a3461]">Solicitud enviada</p>
                      <p className="text-sm text-slate-500 mt-2">
                        Tu solicitud para unirte a <strong>{pendingMsg}</strong> está pendiente de aprobación.
                        Un administrador revisará tu acceso y te notificará.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleTabChange("login")}
                    >
                      Ir a iniciar sesión
                    </Button>
                  </div>
                )}

              </div>
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
