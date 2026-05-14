-- Normalizar correos existentes a minúsculas
update public.clientes
  set correo = lower(correo)
  where correo != lower(correo);

-- Recrear políticas RLS con comparación case-insensitive (lower)
drop policy if exists "auth_select_own_cliente" on public.clientes;
drop policy if exists "auth_update_own_cliente" on public.clientes;

create policy "auth_select_own_cliente" on public.clientes
  for select to authenticated
  using (lower(correo) = lower(auth.email()));

create policy "auth_update_own_cliente" on public.clientes
  for update to authenticated
  using  (lower(correo) = lower(auth.email()))
  with check (lower(correo) = lower(auth.email()));
