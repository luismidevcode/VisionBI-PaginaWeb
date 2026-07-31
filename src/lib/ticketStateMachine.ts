export type Estado    = "abierto" | "en_progreso" | "resuelto" | "cerrado";
export type Prioridad = "baja" | "media" | "alta" | "critica";
export type EstimacionEstado = "no_requerida" | "pendiente" | "en_revision" | "aceptada" | "rechazada";

type QuienPuede = "asignado" | "creador_o_admin";

interface Transicion {
  to:    Estado;
  quien: QuienPuede;
}

const TRANSICIONES: Record<Estado, Transicion[]> = {
  abierto:     [{ to: "en_progreso", quien: "asignado" }],
  en_progreso: [{ to: "resuelto",    quien: "asignado" }],
  resuelto:    [{ to: "cerrado",     quien: "creador_o_admin" }],
  cerrado:     [],
};

export interface ResultadoTransicion {
  permitido: boolean;
  razon?:    string;
}

export function puedeTransicionar(
  estadoActual: Estado,
  estadoNuevo:  Estado,
  userId:       string,
  creadorId:    string,
  asignadoId:   string | null | undefined,
  esAdmin:      boolean,
): ResultadoTransicion {
  const t = TRANSICIONES[estadoActual]?.find((x) => x.to === estadoNuevo);

  if (!t) {
    return {
      permitido: false,
      razon: `La transición de "${estadoActual}" a "${estadoNuevo}" no está permitida.`,
    };
  }

  if (t.quien === "asignado") {
    if (!asignadoId) {
      return { permitido: false, razon: "El ticket no tiene usuario asignado." };
    }
    if (userId !== asignadoId) {
      return { permitido: false, razon: "Solo el usuario asignado puede realizar esta acción." };
    }
  }

  if (t.quien === "creador_o_admin") {
    if (userId !== creadorId && !esAdmin) {
      return { permitido: false, razon: "Solo el creador o un administrador puede cerrar el ticket." };
    }
  }

  return { permitido: true };
}

export function transicionesDisponibles(estado: Estado): Estado[] {
  return (TRANSICIONES[estado] ?? []).map((t) => t.to);
}

/** Los tickets críticos requieren una estimación de horas aceptada por el creador antes de iniciar progreso. */
export function requiereEstimacion(prioridad: Prioridad): boolean {
  return prioridad === "critica";
}

/** True cuando el ticket aún no puede pasar a "en_progreso" porque falta la estimación de horas. */
export function estimacionBloqueaInicio(prioridad: Prioridad, estimacionEstado: EstimacionEstado): boolean {
  return requiereEstimacion(prioridad) && estimacionEstado !== "aceptada";
}

export const ESTIMACION_ESTADO_LABELS: Record<EstimacionEstado, string> = {
  no_requerida: "No requerida",
  pendiente:    "Pendiente de propuesta",
  en_revision:  "En revisión",
  aceptada:     "Aceptada",
  rechazada:    "Rechazada",
};

export const ESTADO_LABELS: Record<Estado, string> = {
  abierto:     "Abierto",
  en_progreso: "En progreso",
  resuelto:    "Resuelto",
  cerrado:     "Cerrado",
};

export const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  baja:    "Baja",
  media:   "Media",
  alta:    "Alta",
  critica: "Crítica",
};

export const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  baja:    "bg-slate-100 text-slate-600",
  media:   "bg-blue-50 text-blue-700 border border-blue-200",
  alta:    "bg-orange-50 text-orange-700 border border-orange-200",
  critica: "bg-red-50 text-red-700 border border-red-200",
};

export const ESTADO_COLOR: Record<Estado, string> = {
  abierto:     "bg-yellow-50 text-yellow-700 border border-yellow-200",
  en_progreso: "bg-blue-50 text-blue-700 border border-blue-200",
  resuelto:    "bg-green-50 text-green-700 border border-green-200",
  cerrado:     "bg-slate-100 text-slate-500",
};
