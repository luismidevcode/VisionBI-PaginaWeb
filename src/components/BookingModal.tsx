import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, isSaturday, isSunday } from "date-fns";
import { es } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Video,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link }     from "react-router-dom";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/lib/supabase";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MEETING_TYPES = [
  "Diagnóstico Gratis",
  "Consultoría",
  "Demo de Producto",
  "Seguimiento",
];

const COLABORADORES_OPTIONS = [
  "1 – 10",
  "11 – 50",
  "51 – 200",
  "201 – 500",
  "Más de 500",
];

const MIN_DAYS_AHEAD = 2;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Slot {
  start: string;
  end:   string;
}

interface ConfirmedBooking {
  date:     string;
  time:     string;
  correo:   string;
  meetLink: string;
}

// ─── Validación ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  tipo_encuentro:    z.string().min(1, "Selecciona un tipo de encuentro"),
  empresa:           z.string().min(2, "Ingresa el nombre de tu empresa"),
  num_colaboradores: z.string().min(1, "Selecciona el número de colaboradores"),
  nit_cedula:        z.string().min(5, "Ingresa un NIT o cédula válido"),
  correo:            z.string().email("Ingresa un correo electrónico válido"),
  telefono:          z.string().min(7, "Ingresa un teléfono válido"),
  motivo:            z.string().min(10, "Describe brevemente el motivo del encuentro"),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSlotTime(iso: string): string {
  const hour    = parseInt(iso.substring(11, 13), 10);
  const minutes = iso.substring(14, 16);
  const ampm    = hour >= 12 ? "PM" : "AM";
  const h       = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${minutes} ${ampm}`;
}

function minBookableDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + MIN_DAYS_AHEAD);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface BookingModalProps {
  open:         boolean;
  onClose:      () => void;
  meetingType?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const BookingModal = ({ open, onClose, meetingType }: BookingModalProps) => {
  const [step,          setStep]          = useState<1 | 2 | 3>(1);
  const [selectedDate,  setSelectedDate]  = useState<Date | undefined>();
  const [slots,         setSlots]         = useState<Slot[]>([]);
  const [selectedSlot,  setSelectedSlot]  = useState<Slot | null>(null);
  const [loadingSlots,  setLoadingSlots]  = useState(false);
  const [slotsError,    setSlotsError]    = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState<string | null>(null);
  const [nitExists,     setNitExists]     = useState(false);
  const [confirmed,     setConfirmed]     = useState<ConfirmedBooking | null>(null);

  // Días disponibles del mes mostrado
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [daysLoaded,    setDaysLoaded]    = useState(false);
  const [displayMonth,  setDisplayMonth]  = useState<Date>(minBookableDate);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo_encuentro:    meetingType ?? "",
      empresa:           "",
      num_colaboradores: "",
      nit_cedula:        "",
      correo:            "",
      telefono:          "",
      motivo:            "",
    },
  });

  useEffect(() => {
    if (meetingType) form.setValue("tipo_encuentro", meetingType);
  }, [meetingType, form]);

  // ── Cargar días disponibles del mes ──────────────────────────────────────

  const fetchAvailableDays = useCallback(async (month: Date) => {
    setDaysLoaded(false);
    try {
      const { data } = await supabase.functions.invoke<{ availableDays: string[] }>(
        "get-slots",
        { body: { month: format(month, "yyyy-MM") } }
      );
      setAvailableDays(new Set(data?.availableDays ?? []));
    } catch {
      setAvailableDays(new Set());
    } finally {
      setDaysLoaded(true);
    }
  }, []);

  // Al abrir el modal, cargar el mes inicial (el más próximo con días hábiles)
  useEffect(() => {
    if (open) {
      const initial = minBookableDate();
      setDisplayMonth(initial);
      fetchAvailableDays(initial);
    }
  }, [open, fetchAvailableDays]);

  // ── Función de días deshabilitados ────────────────────────────────────────

  const isDisabled = useCallback((date: Date): boolean => {
    if (date < minBookableDate() || isSaturday(date) || isSunday(date)) return true;
    if (daysLoaded) return !availableDays.has(format(date, "yyyy-MM-dd"));
    return false;
  }, [availableDays, daysLoaded]);

  // ── Cambio de mes ─────────────────────────────────────────────────────────

  const handleMonthChange = (month: Date) => {
    setDisplayMonth(month);
    setSelectedDate(undefined);
    setSlots([]);
    setSelectedSlot(null);
    fetchAvailableDays(month);
  };

  // ── Obtener slots del día ────────────────────────────────────────────────

  const fetchSlots = async (date: Date) => {
    setLoadingSlots(true);
    setSlotsError(null);
    setSlots([]);
    setSelectedSlot(null);

    try {
      const { data, error } = await supabase.functions.invoke<{ slots: Slot[] }>(
        "get-slots",
        { body: { date: format(date, "yyyy-MM-dd") } }
      );
      if (error) throw error;
      setSlots(data?.slots ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setSlotsError(`Error: ${msg}`);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) fetchSlots(date);
  };

  // ── Enviar formulario ─────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    setNitExists(false);

    try {
      // Verificar si el NIT ya está registrado
      const { data: nitCheck } = await supabase.functions.invoke<{ correo: string }>(
        "lookup-nit",
        { body: { nit_cedula: values.nit_cedula } }
      );
      if (nitCheck?.correo) {
        setNitExists(true);
        return;
      }

      const { data, error } = await supabase.functions.invoke("book-appointment", {
        body: {
          ...values,
          fecha_inicio: selectedSlot.start,
          fecha_fin:    selectedSlot.end,
        },
      });
      if (error) throw error;

      setConfirmed({
        date:     format(selectedDate!, "EEEE d 'de' MMMM yyyy", { locale: es }),
        time:     `${formatSlotTime(selectedSlot.start)} – ${formatSlotTime(selectedSlot.end)}`,
        correo:   values.correo,
        meetLink: (data as { meet_link?: string })?.meet_link ?? "",
      });
      setStep(3);
    } catch {
      setSubmitError("Ocurrió un error al confirmar la cita. Por favor intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Cerrar y resetear ─────────────────────────────────────────────────────

  const handleClose = () => {
    setStep(1);
    setSelectedDate(undefined);
    setSlots([]);
    setSelectedSlot(null);
    setSlotsError(null);
    setSubmitError(null);
    setNitExists(false);
    setConfirmed(null);
    setAvailableDays(new Set());
    setDaysLoaded(false);
    form.reset({ tipo_encuentro: meetingType ?? "", num_colaboradores: "" });
    onClose();
  };

  // ─────────────────────────────────────────────────────────────────────────

  const titulo = meetingType ?? "Diagnóstico Gratis";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">

        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {step === 3 ? (
              <span className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-6 w-6" />
                ¡Cita confirmada!
              </span>
            ) : (
              `Agenda tu ${titulo}`
            )}
          </DialogTitle>
          {step !== 3 && (
            <p className="text-sm text-muted-foreground">
              Paso {step} de 2 —{" "}
              {step === 1 ? "Selecciona fecha y hora" : "Ingresa tus datos"}
            </p>
          )}
        </DialogHeader>

        {/* ── Paso 1: Fecha y hora ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={isDisabled}
                month={displayMonth}
                onMonthChange={handleMonthChange}
                className="rounded-lg border pointer-events-auto"
              />
            </div>

            {!daysLoaded && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">
                Cargando disponibilidad…
              </p>
            )}

            {selectedDate && (
              <div className="space-y-3">
                <p className="text-sm font-medium flex items-center gap-2 text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Horarios disponibles
                </p>

                {loadingSlots && (
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
                    ))}
                  </div>
                )}

                {slotsError && !loadingSlots && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {slotsError}
                  </div>
                )}

                {!loadingSlots && !slotsError && slots.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay horarios disponibles para este día. Selecciona otra fecha.
                  </p>
                )}

                {!loadingSlots && slots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => {
                      const active = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => setSelectedSlot(slot)}
                          className={`h-10 rounded-md text-sm font-medium border transition-all ${
                            active
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background hover:bg-primary/10 hover:border-primary/40 border-border"
                          }`}
                        >
                          {formatSlotTime(slot.start)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <Button
              variant="gradient"
              className="w-full"
              disabled={!selectedDate || !selectedSlot}
              onClick={() => setStep(2)}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Paso 2: Formulario ── */}
        {step === 2 && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Tipo de encuentro */}
              <FormField
                control={form.control}
                name="tipo_encuentro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de encuentro</FormLabel>
                    {meetingType ? (
                      <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm text-foreground">
                        {meetingType}
                      </div>
                    ) : (
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Selecciona el tipo de encuentro</option>
                          {MEETING_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Empresa */}
              <FormField
                control={form.control}
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

              {/* Número de colaboradores */}
              <FormField
                control={form.control}
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

              {/* NIT / Cédula */}
              <FormField
                control={form.control}
                name="nit_cedula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIT / Cédula</FormLabel>
                    <FormControl>
                      <Input placeholder="900123456" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Para NIT, ingresa solo el número sin dígito de verificación.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Correo */}
              <FormField
                control={form.control}
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

              {/* Teléfono */}
              <FormField
                control={form.control}
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

              {/* Motivo */}
              <FormField
                control={form.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo del encuentro</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Cuéntanos brevemente qué quieres mejorar en tu empresa..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {nitExists && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Este NIT ya está registrado en VisionBI
                  </div>
                  <p className="text-sm text-amber-700">
                    Ya agendaste un diagnóstico o eres cliente activo. Para agendar sesiones, accede al portal de clientes.
                  </p>
                  <Link to="/portal" className="inline-block text-sm font-semibold text-[#1a3461] underline">
                    → Ir al Portal de Clientes
                  </Link>
                </div>
              )}

              {submitError && !nitExists && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {submitError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Atrás
                </Button>
                <Button
                  type="submit"
                  variant="gradient"
                  className="flex-1"
                  disabled={submitting}
                >
                  {submitting ? "Confirmando..." : "Confirmar cita"}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* ── Paso 3: Confirmación ── */}
        {step === 3 && confirmed && (
          <div className="space-y-6">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Fecha</p>
                  <p className="font-semibold capitalize">{confirmed.date}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Hora (Colombia)</p>
                  <p className="font-semibold">{confirmed.time}</p>
                </div>
              </div>
              {confirmed.meetLink && (
                <div className="flex items-start gap-3">
                  <Video className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Google Meet</p>
                    <a
                      href={confirmed.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary hover:underline break-all"
                    >
                      {confirmed.meetLink}
                    </a>
                  </div>
                </div>
              )}
            </div>

            {confirmed.meetLink && (
              <a
                href={confirmed.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" className="w-full gap-2">
                  <Video className="h-4 w-4" />
                  Unirse a Google Meet
                </Button>
              </a>
            )}

            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Enviamos un correo de confirmación con el enlace Meet y la invitación
              al calendario a{" "}
              <span className="font-medium text-foreground">{confirmed.correo}</span>.
            </p>

            <Button onClick={handleClose} variant="gradient" className="w-full">
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookingModal;
