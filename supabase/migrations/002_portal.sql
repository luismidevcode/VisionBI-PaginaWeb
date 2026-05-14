-- Proyectos activos por cliente (administrados por VisionBI)
create table if not exists public.proyectos (
  id          uuid        default gen_random_uuid() primary key,
  cliente_id  uuid        references public.clientes(id) on delete cascade not null,
  nombre      text        not null,
  descripcion text,
  estado      text        not null default 'activo',
  created_at  timestamptz default now() not null
);

-- Sesiones agendadas dentro de un proyecto
create table if not exists public.sesiones_proyecto (
  id              uuid        default gen_random_uuid() primary key,
  proyecto_id     uuid        references public.proyectos(id) on delete cascade not null,
  tipo_sesion     text        not null,
  motivo          text,
  fecha_inicio    timestamptz not null,
  fecha_fin       timestamptz not null,
  meet_link       text,
  google_event_id text,
  estado          text        not null default 'confirmada',
  created_at      timestamptz default now() not null
);

alter table public.proyectos         enable row level security;
alter table public.sesiones_proyecto  enable row level security;

-- Clientes: usuario autenticado lee y actualiza su propio perfil
create policy "auth_select_own_cliente" on public.clientes
  for select to authenticated
  using (correo = auth.email());

create policy "auth_update_own_cliente" on public.clientes
  for update to authenticated
  using (correo = auth.email())
  with check (correo = auth.email());

-- Proyectos: cliente autenticado ve solo los suyos
create policy "auth_select_proyectos" on public.proyectos
  for select to authenticated
  using (
    cliente_id in (
      select id from public.clientes where correo = auth.email()
    )
  );

-- Sesiones: cliente autenticado ve las de sus proyectos
create policy "auth_select_sesiones" on public.sesiones_proyecto
  for select to authenticated
  using (
    proyecto_id in (
      select p.id from public.proyectos p
      join public.clientes c on c.id = p.cliente_id
      where c.correo = auth.email()
    )
  );

-- Service role: acceso total
create policy "service_all_proyectos" on public.proyectos
  for all to service_role using (true) with check (true);

create policy "service_all_sesiones" on public.sesiones_proyecto
  for all to service_role using (true) with check (true);
