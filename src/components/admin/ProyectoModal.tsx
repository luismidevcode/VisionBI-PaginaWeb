import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import type { ClienteRow } from "./ClienteModal";

const schema = z.object({
  cliente_id:  z.string().min(1, "Selecciona un cliente"),
  nombre:      z.string().min(2, "Mínimo 2 caracteres"),
  descripcion: z.string().optional(),
  estado:      z.enum(["activo", "inactivo", "completado"]),
});
type Values = z.infer<typeof schema>;

export interface ProyectoRow {
  id: string;
  cliente_id: string;
  nombre: string;
  descripcion: string | null;
  estado: string;
  clientes?: { empresa: string };
}

interface Props {
  open:     boolean;
  onClose:  () => void;
  proyecto: ProyectoRow | null;
  clientes: ClienteRow[];
  onSaved:  () => void;
}

const ESTADOS = [
  { value: "activo",     label: "Activo"     },
  { value: "inactivo",   label: "Inactivo"   },
  { value: "completado", label: "Completado" },
];

const ProyectoModal = ({ open, onClose, proyecto, clientes, onSaved }: Props) => {
  const isEdit = !!proyecto;

  const form = useForm<Values>({
    resolver:      zodResolver(schema),
    defaultValues: { cliente_id: "", nombre: "", descripcion: "", estado: "activo" },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        proyecto
          ? {
              cliente_id:  proyecto.cliente_id,
              nombre:      proyecto.nombre,
              descripcion: proyecto.descripcion ?? "",
              estado:      proyecto.estado as Values["estado"],
            }
          : { cliente_id: "", nombre: "", descripcion: "", estado: "activo" }
      );
    }
  }, [open, proyecto, form]);

  const onSubmit = async (values: Values) => {
    if (isEdit) {
      await supabase
        .from("proyectos")
        .update({
          nombre:      values.nombre,
          descripcion: values.descripcion || null,
          estado:      values.estado,
        })
        .eq("id", proyecto!.id);
    } else {
      await supabase.from("proyectos").insert({
        cliente_id:  values.cliente_id,
        nombre:      values.nombre,
        descripcion: values.descripcion || null,
        estado:      values.estado,
      });
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">

            <FormField control={form.control} name="cliente_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Cliente</FormLabel>
                {isEdit ? (
                  <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm">
                    {proyecto?.clientes?.empresa ?? proyecto?.cliente_id}
                  </div>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nombre" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del proyecto</FormLabel>
                <FormControl><Input placeholder="Dashboard Power BI" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="descripcion" render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                <FormControl>
                  <Textarea placeholder="Describe el alcance del proyecto..." rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="estado" render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-[#1a3461] hover:bg-[#15294f] text-white">
                {isEdit ? "Guardar cambios" : "Crear proyecto"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ProyectoModal;
