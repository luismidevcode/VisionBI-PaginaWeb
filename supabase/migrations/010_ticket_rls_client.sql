-- Clientes solo ven sus propios tickets (creador_id = auth.uid()).
-- Admins mantienen acceso total via admin_all_tickets.

drop policy if exists "member_read_tickets"    on public.tickets;
drop policy if exists "member_read_actividad"  on public.ticket_actividad;
drop policy if exists "member_read_adjuntos"   on public.ticket_adjuntos;
drop policy if exists "member_insert_adjuntos" on public.ticket_adjuntos;

create policy "member_read_tickets" on public.tickets
  for select to authenticated
  using (public.is_admin() or creador_id = auth.uid());

create policy "member_read_actividad" on public.ticket_actividad
  for select to authenticated
  using (
    public.is_admin() or
    ticket_id in (select id from public.tickets where creador_id = auth.uid())
  );

create policy "member_read_adjuntos" on public.ticket_adjuntos
  for select to authenticated
  using (
    public.is_admin() or
    ticket_id in (select id from public.tickets where creador_id = auth.uid())
  );

create policy "member_insert_adjuntos" on public.ticket_adjuntos
  for insert to authenticated
  with check (
    public.is_admin() or
    ticket_id in (select id from public.tickets where creador_id = auth.uid())
  );

-- Función para listar el equipo VisionBI (usada en el panel admin para asignar tickets).
create or replace function public.list_admin_users()
returns table(user_id uuid, correo_usuario text)
language sql
stable
security definer
set search_path = public
as $$
  select id, email::text
  from auth.users
  where email = any(array['luis.visionbi@gmail.com', 'luismiguelbotero2327@gmail.com'])
$$;

grant execute on function public.list_admin_users() to authenticated;
