-- Función pública para verificar NIT durante el registro.
-- Usa SECURITY DEFINER para bypassear RLS y solo devuelve el nombre de empresa,
-- evitando exponer otros campos sensibles (correo, telefono, etc.).

create or replace function public.check_nit(p_nit text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select empresa from public.clientes
  where nit_cedula = trim(p_nit)
  limit 1;
$$;

grant execute on function public.check_nit(text) to anon, authenticated;
