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
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

const COLABORADORES_OPTIONS = ["1 – 10", "11 – 50", "51 – 200", "201 – 500", "Más de 500"];

const schema = z.object({
  empresa:           z.string().min(2, "Mínimo 2 caracteres"),
  nit_cedula:        z.string().min(5, "Mínimo 5 caracteres"),
  correo:            z.string().email("Correo inválido"),
  telefono:          z.string().min(7, "Mínimo 7 dígitos"),
  num_colaboradores: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export interface ClienteRow {
  id: string;
  empresa: string;
  nit_cedula: string;
  correo: string;
  telefono: string;
  num_colaboradores: string | null;
}

interface Props {
  open:     boolean;
  onClose:  () => void;
  cliente:  ClienteRow | null;
  onSaved:  () => void;
}

const ClienteModal = ({ open, onClose, cliente, onSaved }: Props) => {
  const isEdit = !!cliente;

  const form = useForm<Values>({
    resolver:      zodResolver(schema),
    defaultValues: { empresa: "", nit_cedula: "", correo: "", telefono: "", num_colaboradores: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        cliente
          ? {
              empresa:           cliente.empresa,
              nit_cedula:        cliente.nit_cedula,
              correo:            cliente.correo,
              telefono:          cliente.telefono,
              num_colaboradores: cliente.num_colaboradores ?? "",
            }
          : { empresa: "", nit_cedula: "", correo: "", telefono: "", num_colaboradores: "" }
      );
    }
  }, [open, cliente, form]);

  const onSubmit = async (values: Values) => {
    if (isEdit) {
      await supabase
        .from("clientes")
        .update({
          empresa:           values.empresa,
          telefono:          values.telefono,
          num_colaboradores: values.num_colaboradores || null,
          updated_at:        new Date().toISOString(),
        })
        .eq("id", cliente!.id);
    } else {
      await supabase.from("clientes").insert({
        empresa:           values.empresa,
        nit_cedula:        values.nit_cedula.trim(),
        correo:            values.correo,
        telefono:          values.telefono,
        num_colaboradores: values.num_colaboradores || null,
      });
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">

            <FormField control={form.control} name="empresa" render={({ field }) => (
              <FormItem>
                <FormLabel>Empresa</FormLabel>
                <FormControl><Input placeholder="Nombre de la empresa" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="nit_cedula" render={({ field }) => (
                <FormItem>
                  <FormLabel>NIT / Cédula</FormLabel>
                  <FormControl>
                    {isEdit
                      ? <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm">{field.value}</div>
                      : <Input placeholder="900123456" {...field} />
                    }
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="telefono" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl><Input type="tel" placeholder="300 000 0000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="correo" render={({ field }) => (
              <FormItem>
                <FormLabel>Correo electrónico</FormLabel>
                <FormControl>
                  {isEdit
                    ? <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm">{field.value}</div>
                    : <Input type="email" placeholder="contacto@empresa.com" {...field} />
                  }
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {!isEdit && (
              <FormField control={form.control} name="num_colaboradores" render={({ field }) => (
                <FormItem>
                  <FormLabel>Colaboradores</FormLabel>
                  <FormControl>
                    <select
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Selecciona el rango</option>
                      {COLABORADORES_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-[#1a3461] hover:bg-[#15294f] text-white">
                {isEdit ? "Guardar cambios" : "Crear cliente"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ClienteModal;
