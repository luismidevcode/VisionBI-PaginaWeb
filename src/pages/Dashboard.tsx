import { useState, useEffect } from "react";
import { useNavigate }         from "react-router-dom";
import {
  LogOut, CalendarPlus, FolderOpen, User, Save,
  AlertCircle, CheckCircle2, Pencil,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import SessionModal from "@/components/portal/SessionModal";

interface Cliente {
  id:         string;
  empresa:    string;
  nit_cedula: string;
  correo:     string;
  telefono:   string;
}

interface Proyecto {
  id:          string;
  nombre:      string;
  descripcion: string | null;
  estado:      string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();

  const [cliente,       setCliente]       = useState<Cliente | null>(null);
  const [proyectos,     setProyectos]     = useState<Proyecto[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<"proyectos" | "perfil">("proyectos");
  const [sessionModal,  setSessionModal]  = useState<{ open: boolean; proyecto: Proyecto | null }>({
    open: false, proyecto: null,
  });

  // Perfil editable
  const [editMode,      setEditMode]      = useState(false);
  const [profileForm,   setProfileForm]   = useState({ empresa: "", telefono: "", correo: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── Cargar datos ────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/portal"); return; }

      const { data: cl } = await supabase
        .from("clientes")
        .select("id, empresa, nit_cedula, correo, telefono")
        .single();

      if (!cl) { navigate("/portal"); return; }

      setCliente(cl);
      setProfileForm({ empresa: cl.empresa, telefono: cl.telefono, correo: cl.correo });

      const { data: proy } = await supabase
        .from("proyectos")
        .select("id, nombre, descripcion, estado")
        .eq("cliente_id", cl.id)
        .eq("estado", "activo")
        .order("created_at", { ascending: false });

      setProyectos(proy ?? []);
      setLoading(false);
    };
    load();
  }, [navigate]);

  // ── Logout ──────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal");
  };

  // ── Guardar perfil ──────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!cliente) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const { error } = await supabase
        .from("clientes")
        .update({
          empresa:    profileForm.empresa,
          telefono:   profileForm.telefono,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cliente.id);

      if (error) throw error;
      setCliente((prev) => prev ? { ...prev, empresa: profileForm.empresa, telefono: profileForm.telefono } : prev);
      setProfileMsg({ type: "ok", text: "Información actualizada correctamente." });
      setEditMode(false);
    } catch {
      setProfileMsg({ type: "err", text: "Error al guardar. Intenta de nuevo." });
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/Logo.jpg"
              alt="VisionBI"
              className="h-9 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="text-sm font-semibold text-[#1a3461] hidden sm:block">
              {cliente?.empresa}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-600 gap-2"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </Button>
        </div>
      </header>

      {/* Nav tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {([
            { key: "proyectos", label: "Mis proyectos", icon: FolderOpen },
            { key: "perfil",    label: "Mi perfil",     icon: User },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-[#1a3461] text-[#1a3461]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Proyectos ── */}
        {activeTab === "proyectos" && (
          <div>
            <h2 className="text-lg font-bold text-[#1a3461] mb-6">Proyectos activos</h2>

            {proyectos.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No tienes proyectos activos</p>
                <p className="text-slate-400 text-sm mt-1">
                  Contacta a VisionBI para iniciar un proyecto.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {proyectos.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 hover:border-[#00b8d9] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-semibold text-[#1a3461]">{p.nombre}</h3>
                        {p.descripcion && (
                          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{p.descripcion}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">
                        Activo
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-[#1a3461] hover:bg-[#15294f] text-white gap-2 mt-1"
                      onClick={() => setSessionModal({ open: true, proyecto: p })}
                    >
                      <CalendarPlus className="h-4 w-4" /> Agendar sesión
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Perfil ── */}
        {activeTab === "perfil" && cliente && (
          <div className="max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#1a3461]">Mi información</h2>
              {!editMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[#1a3461] text-[#1a3461]"
                  onClick={() => { setEditMode(true); setProfileMsg(null); }}
                >
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              )}
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 text-sm rounded-lg p-3 mb-5 ${
                profileMsg.type === "ok"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {profileMsg.type === "ok"
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  : <AlertCircle  className="h-4 w-4 flex-shrink-0" />
                }
                {profileMsg.text}
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">

              {/* Empresa */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Empresa</Label>
                {editMode ? (
                  <Input
                    value={profileForm.empresa}
                    onChange={(e) => setProfileForm((f) => ({ ...f, empresa: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-800">{cliente.empresa}</p>
                )}
              </div>

              {/* NIT (inmutable) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">NIT / Cédula</Label>
                <p className="text-sm font-medium text-slate-800">{cliente.nit_cedula}</p>
                <p className="text-xs text-slate-400">No modificable.</p>
              </div>

              {/* Correo (inmutable por ahora) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Correo electrónico</Label>
                <p className="text-sm font-medium text-slate-800">{cliente.correo}</p>
              </div>

              {/* Teléfono */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Teléfono</Label>
                {editMode ? (
                  <Input
                    value={profileForm.telefono}
                    onChange={(e) => setProfileForm((f) => ({ ...f, telefono: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-800">{cliente.telefono}</p>
                )}
              </div>

              {editMode && (
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setEditMode(false);
                      setProfileForm({ empresa: cliente.empresa, telefono: cliente.telefono, correo: cliente.correo });
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-[#1a3461] hover:bg-[#15294f] text-white gap-2"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                  >
                    <Save className="h-4 w-4" />
                    {savingProfile ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal de sesión */}
      {sessionModal.proyecto && (
        <SessionModal
          open={sessionModal.open}
          onClose={() => setSessionModal({ open: false, proyecto: null })}
          proyectoId={sessionModal.proyecto.id}
          projectName={sessionModal.proyecto.nombre}
        />
      )}
    </div>
  );
};

export default Dashboard;
