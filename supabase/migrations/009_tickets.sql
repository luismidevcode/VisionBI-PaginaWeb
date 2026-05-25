-- ─── Tickets ──────────────────────────────────────────────────────────────────

create table public.tickets (
  id          uuid        default gen_random_uuid() primary key,
  titulo      text        not null,
  descripcion text,
  prioridad   text        not null check (prioridad in ('baja','media','alta','critica')),
  estado      text        not null default 'abierto' check (estado in ('abierto','en_progreso','resuelto','cerrado')),
  proyecto_id uuid        not null references public.proyectos(id) on delete cascade,
  creador_id  uuid        not null references auth.users(id),
  asignado_id uuid        references auth.users(id),
  resolved_at timestamptz,
  closed_at   timestamptz,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- ─── Historial de actividad ────────────────────────────────────────────────────
-- tipos: 'estado' | 'comentario' | 'asignacion'
create table public.ticket_actividad (
  id         uuid        default gen_random_uuid() primary key,
  ticket_id  uuid        not null references public.tickets(id) on delete cascade,
  usuario_id uuid        not null references auth.users(id),
  tipo       text        not null check (tipo in ('estado','comentario','asignacion')),
  contenido  jsonb       not null default '{}',
  created_at timestamptz default now() not null
);

-- ─── Adjuntos ──────────────────────────────────────────────────────────────────
create table public.ticket_adjuntos (
  id         uuid        default gen_random_uuid() primary key,
  ticket_id  uuid        not null references public.tickets(id) on delete cascade,
  url        text        not null,
  nombre     text        not null,
  tipo_mime  text,
  created_at timestamptz default now() not null
);

-- ─── Notificaciones in-app ────────────────────────────────────────────────────
create table public.notificaciones (
  id         uuid        default gen_random_uuid() primary key,
  usuario_id uuid        not null references auth.users(id) on delete cascade,
  tipo       text        not null,
  titulo     text        not null,
  mensaje    text        not null,
  leida      boolean     not null default false,
  metadata   jsonb       default '{}',
  created_at timestamptz default now() not null
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.tickets          enable row level security;
alter table public.ticket_actividad enable row level security;
alter table public.ticket_adjuntos  enable row level security;
alter table public.notificaciones   enable row level security;

-- Service role: acceso total
create policy "service_all_tickets"          on public.tickets          for all to service_role using (true) with check (true);
create policy "service_all_ticket_actividad" on public.ticket_actividad for all to service_role using (true) with check (true);
create policy "service_all_ticket_adjuntos"  on public.ticket_adjuntos  for all to service_role using (true) with check (true);
create policy "service_all_notificaciones"   on public.notificaciones   for all to service_role using (true) with check (true);

-- Admin VisionBI: acceso total
create policy "admin_all_tickets"          on public.tickets          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_ticket_actividad" on public.ticket_actividad for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_ticket_adjuntos"  on public.ticket_adjuntos  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_notificaciones"   on public.notificaciones   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tickets: miembros activos de la empresa leen tickets de sus proyectos
create policy "member_read_tickets" on public.tickets
  for select to authenticated
  using (
    public.is_admin() or
    proyecto_id in (
      select p.id from public.proyectos p
      join public.empresa_usuarios eu on eu.cliente_id = p.cliente_id
      where eu.user_id = auth.uid() and eu.status = 'active'
    )
  );

-- Tickets: miembros activos pueden crear tickets en sus proyectos
create policy "member_insert_tickets" on public.tickets
  for insert to authenticated
  with check (
    creador_id = auth.uid() and
    proyecto_id in (
      select p.id from public.proyectos p
      join public.empresa_usuarios eu on eu.cliente_id = p.cliente_id
      where eu.user_id = auth.uid() and eu.status = 'active'
    )
  );

-- Actividad: miembros activos pueden leer la actividad de sus tickets
create policy "member_read_actividad" on public.ticket_actividad
  for select to authenticated
  using (
    public.is_admin() or
    ticket_id in (
      select t.id from public.tickets t
      join public.proyectos p on p.id = t.proyecto_id
      join public.empresa_usuarios eu on eu.cliente_id = p.cliente_id
      where eu.user_id = auth.uid() and eu.status = 'active'
    )
  );

-- Adjuntos: miembros activos pueden leer y subir adjuntos
create policy "member_read_adjuntos" on public.ticket_adjuntos
  for select to authenticated
  using (
    public.is_admin() or
    ticket_id in (
      select t.id from public.tickets t
      join public.proyectos p on p.id = t.proyecto_id
      join public.empresa_usuarios eu on eu.cliente_id = p.cliente_id
      where eu.user_id = auth.uid() and eu.status = 'active'
    )
  );

create policy "member_insert_adjuntos" on public.ticket_adjuntos
  for insert to authenticated
  with check (
    ticket_id in (
      select t.id from public.tickets t
      join public.proyectos p on p.id = t.proyecto_id
      join public.empresa_usuarios eu on eu.cliente_id = p.cliente_id
      where eu.user_id = auth.uid() and eu.status = 'active'
    )
  );

-- Notificaciones: cada usuario lee, actualiza y elimina las suyas
create policy "user_read_notificaciones"   on public.notificaciones for select to authenticated using (usuario_id = auth.uid());
create policy "user_update_notificaciones" on public.notificaciones for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "user_delete_notificaciones" on public.notificaciones for delete to authenticated using (usuario_id = auth.uid());

-- ─── Storage bucket para adjuntos ─────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-adjuntos', 'ticket-adjuntos', false, 10485760,
  array['image/jpeg','image/png','image/gif','image/webp','application/pdf',
        'text/plain','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) on conflict (id) do nothing;

create policy "member_upload_storage"    on storage.objects for insert to authenticated with check (bucket_id = 'ticket-adjuntos');
create policy "member_read_storage"      on storage.objects for select to authenticated using  (bucket_id = 'ticket-adjuntos');
create policy "member_delete_storage"    on storage.objects for delete to authenticated using  (bucket_id = 'ticket-adjuntos');
