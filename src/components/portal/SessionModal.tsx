import { useState, useEffect, useCallback } from "react";
import { useForm }         from "react-hook-form";
import { zodResolver }     from "@hookform/resolvers/zod";
import { z }               from "zod";
import { format, isSaturday, isSunday } from "date-fns";
import { es }              from "date-fns/locale";
import {
  Calendar as CalendarIcon, Clock, CheckCircle2,
  ChevronRight, ChevronLeft, AlertCircle, Video,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

const SESSION_TYPES = [
  "Reunión de seguimiento",
  "Entrega de avance",
  "Revisión técnica",
  "Capacitación",
  "Reunión de cierre",
  "Revisión y aprobación de requerimientos",
];

const MIN_DAYS_AHEAD = 7;

interface Slot { start: string; end: string; }

interface ConfirmedSession {
  projectName: string;
  tipo_sesion: string;
  date:        string;
  time:        string;
  meetLink:    string;
}

const formSchema = z.object({
  tipo_sesion: z.string().min(1, "Selecciona el tipo de sesión"),
  motivo:      z.string().min(10, "Describe brevemente el motivo de la sesión"),
});
type FormValues = z.infer<typeof formSchema>;

function formatSlotTime(iso: string): string {
  const hour  = parseInt(iso.substring(11, 13), 10);
  const mins  = iso.substring(14, 16);
  const ampm  = hour >= 12 ? "PM" : "AM";
  const h     = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${mins} ${ampm}`;
}

function minBookableDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + MIN_DAYS_AHEAD);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface SessionModalProps {
  open:        boolean;
  onClose:     () => void;
  proyectoId:  string;
  projectName: string;
}

const SessionModal = ({ open, onClose, proyectoId, projectName }: SessionModalProps) => {
  const [step,         setStep]         = useState<1 | 2 | 3>(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [slots,        setSlots]        = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError,   setSlotsError]   = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);
  const [confirmed,    setConfirmed]    = useState<ConfirmedSession | null>(null);

  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [daysLoaded,    setDaysLoaded]    = useState(false);
  const [displayMonth,  setDisplayMonth]  = useState<Date>(minBookableDate);

  const form = useForm<FormValues>({
    resolver:      zodResolver(formSchema),
    defaultValues: { tipo_sesion: "", motivo: "" },
  });

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

  useEffect(() => {
    if (open) {
      const initial = minBookableDate();
      setDisplayMonth(initial);
      fetchAvailableDays(initial);
    }
  }, [open, fetchAvailableDays]);

  const isDisabled = useCallback((date: Date): boolean => {
    if (date < minBookableDate() || isSaturday(date) || isSunday(date)) return true;
    if (daysLoaded) return !availableDays.has(format(date, "yyyy-MM-dd"));
    return false;
  }, [availableDays, daysLoaded]);

  const handleMonthChange = (month: Date) => {
    setDisplayMonth(month);
    setSelectedDate(undefined);
    setSlots([]);
    setSelectedSlot(null);
    fetchAvailableDays(month);
  };

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
      setSlotsError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingSlots(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.functions.invoke("book-session", {
        body: {
          proyecto_id:  proyectoId,
          tipo_sesion:  values.tipo_sesion,
          motivo:       values.motivo,
          fecha_inicio: selectedSlot.start,
          fecha_fin:    selectedSlot.end,
        },
      });
      if (error) throw error;
      setConfirmed({
        projectName,
        tipo_sesion: values.tipo_sesion,
        date:        format(selectedDate!, "EEEE d 'de' MMMM yyyy", { locale: es }),
        time:        `${formatSlotTime(selectedSlot.start)} – ${formatSlotTime(selectedSlot.end)}`,
        meetLink:    (data as { meet_link?: string })?.meet_link ?? "",
      });
      setStep(3);
    } catch {
      setSubmitError("Error al confirmar la sesión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedDate(undefined);
    setSlots([]);
    setSelectedSlot(null);
    setSlotsError(null);
    setSubmitError(null);
    setConfirmed(null);
    setAvailableDays(new Set());
    setDaysLoaded(false);
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {step === 3 ? (
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-6 w-6" /> ¡Sesión confirmada!
              </span>
            ) : (
              <>Agendar sesión — <span className="text-[#1a3461]">{projectName}</span></>
            )}
          </DialogTitle>
          {step !== 3 && (
            <p className="text-sm text-muted-foreground">
              Paso {step} de 2 —{" "}
              {step === 1 ? "Selecciona fecha y hora" : "Detalles de la sesión"}
            </p>
          )}
        </DialogHeader>

        {/* Paso 1: Fecha y hora */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { setSelectedDate(d); if (d) fetchSlots(d); }}
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
                <p className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#1a3461]" /> Horarios disponibles
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
                    <AlertCircle className="h-4 w-4" /> {slotsError}
                  </div>
                )}
                {!loadingSlots && !slotsError && slots.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay horarios disponibles. Selecciona otra fecha.
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
                              ? "bg-[#1a3461] text-white border-[#1a3461]"
                              : "bg-background hover:bg-[#1a3461]/10 hover:border-[#1a3461]/40 border-border"
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
              className="w-full bg-[#1a3461] hover:bg-[#15294f] text-white"
              disabled={!selectedDate || !selectedSlot}
              onClick={() => setStep(2)}
            >
              Siguiente <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Paso 2: Detalles */}
        {step === 2 && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="tipo_sesion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de sesión</FormLabel>
                    <Select modal={false} onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona el tipo de sesión" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SESSION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo / Agenda</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="¿Qué temas se tratarán en esta sesión?"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {submitError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" /> {submitError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#1a3461] hover:bg-[#15294f] text-white"
                  disabled={submitting}
                >
                  {submitting ? "Confirmando..." : "Confirmar sesión"}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* Paso 3: Confirmación */}
        {step === 3 && confirmed && (
          <div className="space-y-5">
            <div className="bg-[#1a3461]/5 border border-[#1a3461]/20 rounded-xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-[#1a3461] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Proyecto</p>
                  <p className="font-semibold text-[#1a3461]">{confirmed.projectName}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-[#1a3461] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Fecha</p>
                  <p className="font-semibold capitalize">{confirmed.date}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-[#1a3461] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Hora (Colombia)</p>
                  <p className="font-semibold">{confirmed.time}</p>
                </div>
              </div>
              {confirmed.meetLink && (
                <div className="flex items-start gap-3">
                  <Video className="h-5 w-5 text-[#00b8d9] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Google Meet</p>
                    <a
                      href={confirmed.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#1a3461] hover:underline break-all"
                    >
                      {confirmed.meetLink}
                    </a>
                  </div>
                </div>
              )}
            </div>

            {confirmed.meetLink && (
              <a href={confirmed.meetLink} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" className="w-full gap-2 border-[#1a3461] text-[#1a3461]">
                  <Video className="h-4 w-4" /> Unirse a Google Meet
                </Button>
              </a>
            )}

            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Recibirás un correo de confirmación con la invitación al calendario.
            </p>

            <Button
              onClick={handleClose}
              className="w-full bg-[#1a3461] hover:bg-[#15294f] text-white"
            >
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SessionModal;
