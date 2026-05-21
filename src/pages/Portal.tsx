import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn, UserPlus, AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/lib/supabase";

// ─── Constantes ───────────────────────────────────────────────────────────────

const COLABORADORES_OPTIONS = [
  "1 – 10",
  "11 – 50",
  "51 – 200",
  "201 – 500",
  "Más de 500",
];

// ─── Esquemas ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  nit_cedula: z.string().min(5, "Ingresa tu NIT o cédula"),
  password:   z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const setPassSchema = z.object({
  password:         z.string().min(8, "Mínimo 8 caracteres"),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Las contraseñas no coinciden",
  path:    ["confirm_password"],
});

const registerSchema = z.object({
  empresa:           z.string().min(2, "Ingresa el nombre de tu empresa"),
  nit_cedula:        z.string().min(5, "Ingresa el NIT o cédula sin dígito de verificación"),
  correo:            z.string().email("Correo electrónico inválido"),
  telefono:          z.string().min(7, "Ingresa un teléfono válido"),
  num_colaboradores: z.string().min(1, "Selecciona el número de colaboradores"),
  password:          z.string().min(8, "Mínimo 8 caracteres"),
  confirm_password:  z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Las contraseñas no coinciden",
  path:    ["confirm_password"],
});

type LoginValues    = z.infer<typeof loginSchema>;
type SetPassValues  = z.infer<typeof setPassSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

// Etapas del flujo de registro
type RegStage = "nit" | "set-password" | "full";

// ─── Componente ───────────────────────────────────────────────────────────────

const Portal = () => {
  const navigate = useNavigate();
  const [tab,         setTab]         = useState<"login" | "register">("login");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loginSuggestRegister, setLoginSuggestRegister] = useState(false);

  // Estado del flujo de registro
  const [regStage,      setRegStage]      = useState<RegStage>("nit");
  const [regNit,        setRegNit]        = useState("");
  const [regNitError,   setRegNitError]   = useState<string | null>(null);
  const [regFoundEmail, setRegFoundEmail] = useState("");
  const [regChecking,   setRegChecking]   = useState(false);

  // ── Formularios ────────────────────────────────────────────────────────────

  const loginForm = useForm<LoginValues>({
    resolver:      zodResolver(loginSchema),
    defaultValues: { nit_cedula: "", password: "" },
  });

  const setPassForm = useForm<SetPassValues>({
    resolver:      zodResolver(setPassSchema),
    defaultValues: { password: "", confirm_password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver:      zodResolver(registerSchema),
    defaultValues: {
      empresa: "", nit_cedula: "", correo: "", telefono: "",
      num_colaboradores: "", password: "", confirm_password: "",
    },
  });

  // ── Cambio de pestaña ──────────────────────────────────────────────────────

  const handleTabChange = (t: "login" | "register", prefillNit?: string) => {
    setTab(t);
    setError(null);
    setLoginSuggestRegister(false);
    if (t === "register") {
      setRegStage("nit");
      setRegNit("");
      setRegNitError(null);
      setRegFoundEmail("");
      setShowPass(false);
      setShowConfirm(false);
      setPassForm.reset();
      registerForm.reset();
      if (prefillNit) setRegNit(prefillNit);
    }
  };

  // ── Login ──────────────────────────────────────────────────────────────────

  const onLogin = async (values: LoginValues) => {
    setLoading(true);
    setError(null);
    setLoginSuggestRegister(false);
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
        // El cliente existe en la BD pero el login falló: puede que nunca haya creado contraseña
        setError("Credenciales incorrectas.");
        setLoginSuggestRegister(true);
        return;
      }
      navigate("/portal/dashboard");
    } catch {
      setError("Error al iniciar sesión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // ── Registro: paso 1 — verificar NIT ──────────────────────────────────────

  const handleNitCheck = async () => {
    const nit = regNit.trim();
    if (nit.length < 5) {
      setRegNitError("Ingresa el NIT o cédula (mínimo 5 caracteres)");
      return;
    }
    setRegChecking(true);
    setRegNitError(null);
    try {
      const { data } = await supabase.functions.invoke<{ correo: string }>(
        "lookup-nit",
        { body: { nit_cedula: nit } }
      );
      if (data?.correo) {
        setRegFoundEmail(data.correo);
        setRegStage("set-password");
      } else {
        registerForm.setValue("nit_cedula", nit);
        setRegStage("full");
      }
    } catch {
      setRegNitError("Error al verificar. Intenta de nuevo.");
    } finally {
      setRegChecking(false);
    }
  };

  // ── Registro: paso 2a — solo contraseña (cliente existente) ───────────────

  const onSetPassword = async (values: SetPassValues) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.functions.invoke<{
        success: boolean; error?: string;
        access_token?: string; refresh_token?: string;
      }>("register-client", {
        body: { mode: "set-password", nit_cedula: regNit, password: values.password },
      });
      if (!data?.success) {
        setError(data?.error ?? "Error al crear la cuenta.");
        return;
      }
      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        navigate("/portal/dashboard");
        return;
      }
      // Fallback si el servidor no devolvió sesión
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: regFoundEmail, password: values.password,
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

  // ── Registro: paso 2b — formulario completo (cliente nuevo) ───────────────

  const onRegister = async (values: RegisterValues) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.functions.invoke<{
        success: boolean; error?: string;
        access_token?: string; refresh_token?: string;
      }>("register-client", {
        body: {
          empresa:           values.empresa,
          nit_cedula:        values.nit_cedula,
          correo:            values.correo,
          telefono:          values.telefono,
          num_colaboradores: values.num_colaboradores,
          password:          values.password,
        },
      });
      if (!data?.success) {
        setError(data?.error ?? "Error al registrarse.");
        return;
      }
      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        navigate("/portal/dashboard");
        return;
      }
      // Fallback si el servidor no devolvió sesión
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: values.correo, password: values.password,
      });
      if (!authError) { navigate("/portal/dashboard"); return; }
      setError("Cuenta creada. Por favor inicia sesión.");
      handleTabChange("login");
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
              <div className="flex flex-col gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
                {loginSuggestRegister && (
                  <button
                    type="button"
                    onClick={() => handleTabChange("register", loginForm.getValues("nit_cedula"))}
                    className="text-left text-[#1a3461] font-semibold underline text-xs"
                  >
                    ¿Aún no tienes contraseña? → Ir a Registrarse para crearla
                  </button>
                )}
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

            {/* ── Registro ── */}
            {tab === "register" && (
              <div className="space-y-5">

                {/* Etapa 1: verificar NIT */}
                {regStage === "nit" && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500">
                      Primero verificamos si ya tienes cuenta con tu NIT o cédula.
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

                {/* Etapa 2a: cliente existente → solo contraseña */}
                {regStage === "set-password" && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-[#1a3461] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-[#1a3461]">¡Ya eres cliente de VisionBI!</p>
                        <p className="text-sm text-slate-600 mt-1">
                          Tu NIT ya está en nuestro sistema. Solo necesitas crear una contraseña para acceder al portal.
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          Cuenta: <span className="font-medium">{regFoundEmail}</span>
                        </p>
                      </div>
                    </div>

                    <Form {...setPassForm}>
                      <form onSubmit={setPassForm.handleSubmit(onSetPassword)} className="space-y-4">
                        <FormField
                          control={setPassForm.control}
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
                          control={setPassForm.control}
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
                        <div className="flex gap-3">
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
                            {loading ? "Creando..." : "Crear contraseña"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>
                )}

                {/* Etapa 2b: cliente nuevo → formulario completo */}
                {regStage === "full" && (
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

                      {/* NIT pre-llenado, solo lectura */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">NIT / Cédula</Label>
                        <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm text-foreground">
                          {regNit}
                        </div>
                      </div>

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
                        name="num_colaboradores"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número de colaboradores</FormLabel>
                            <FormControl>
                              <select
                                value={field.value}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">Selecciona el rango</option>
                                {COLABORADORES_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
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
                          {loading ? "Creando cuenta..." : "Crear cuenta"}
                        </Button>
                      </div>
                    </form>
                  </Form>
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
