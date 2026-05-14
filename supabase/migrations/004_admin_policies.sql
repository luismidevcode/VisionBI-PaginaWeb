-- Función auxiliar para verificar rol admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select auth.email() in (
    'luis.visionbi@gmail.com',
    'luismiguelbotero2327@gmail.com'
  )
$$;

-- Admin: acceso total a clientes
create policy "admin_all_clientes" on public.clientes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin: acceso total a agendamientos
create policy "admin_all_agendamientos" on public.agendamientos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin: acceso total a proyectos
create policy "admin_all_proyectos" on public.proyectos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin: acceso total a sesiones_proyecto
create policy "admin_all_sesiones" on public.sesiones_proyecto
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
