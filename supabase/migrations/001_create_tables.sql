-- Tabla de clientes
create table if not exists public.clientes (
  id          uuid        default gen_random_uuid() primary key,
  empresa     text        not null,
  nit_cedula  text        not null,
  correo      text        not null unique,
  telefono    text        not null,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- Tabla de agendamientos
create table if not exists public.agendamientos (
  id               uuid        default gen_random_uuid() primary key,
  cliente_id       uuid        references public.clientes(id) on delete cascade not null,
  tipo_encuentro   text        not null,
  motivo           text,
  fecha_inicio     timestamptz not null,
  fecha_fin        timestamptz not null,
  google_event_id  text,
  estado           text        not null default 'confirmado',
  created_at       timestamptz default now() not null
);

-- RLS
alter table public.clientes    enable row level security;
alter table public.agendamientos enable row level security;

-- Permitir inserción anónima (formulario público)
create policy "anon_insert_clientes" on public.clientes
  for insert to anon with check (true);

create policy "anon_insert_agendamientos" on public.agendamientos
  for insert to anon with check (true);

-- Acceso total para service_role (Edge Functions)
create policy "service_all_clientes" on public.clientes
  for all to service_role using (true) with check (true);

create policy "service_all_agendamientos" on public.agendamientos
  for all to service_role using (true) with check (true);
