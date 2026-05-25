import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Notificacion {
  id:         string;
  tipo:       string;
  titulo:     string;
  mensaje:    string;
  leida:      boolean;
  metadata:   Record<string, unknown>;
  created_at: string;
}

export const NotificationBell = () => {
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [open,   setOpen]   = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notificaciones")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    setNotifs((data as Notificacion[]) ?? []);
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("notificaciones-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificaciones" }, load)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const markAllRead = async () => {
    const ids = notifs.filter((n) => !n.leida).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from("notificaciones").update({ leida: true }).in("id", ids);
    setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
  };

  const markRead = async (id: string) => {
    await supabase.from("notificaciones").update({ leida: true }).eq("id", id);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
  };

  const unread = notifs.filter((n) => !n.leida).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5 text-slate-500" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">Notificaciones</span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-[#00b8d9] hover:underline"
                >
                  Marcar todas como leídas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {notifs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Sin notificaciones</p>
              ) : (
                notifs.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                      !n.leida ? "bg-[#00b8d9]/5 border-l-2 border-l-[#00b8d9]" : ""
                    }`}
                  >
                    <p className={`text-sm font-medium leading-snug ${!n.leida ? "text-slate-900" : "text-slate-600"}`}>
                      {n.titulo}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.mensaje}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(n.created_at).toLocaleDateString("es-CO", {
                        day: "numeric", month: "short",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
