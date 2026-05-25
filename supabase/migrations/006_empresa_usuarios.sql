-- ─── Tabla empresa_usuarios ──────────────────────────────────────────────────
-- Vincula usuarios de Supabase Auth a una empresa con rol y permisos granulares.
-- Un usuario pertenece a exactamente una empresa (UNIQUE user_id).

create table public.empresa_usuarios (
  id                uuid        default gen_random_uuid() primary key,
  cliente_id        uuid        not null references public.clientes(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  role              text        not null check (role in ('owner', 'manager', 'analista', 'viewer')),
  can_book_sessions boolean     not null default false,
  can_view_projects boolean     not null default true,
  can_view_sessions boolean     not null default false,
  can_edit_company  boolean     not null default false,
  correo_usuario    text        not null default '',
  status            text        not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null,
  unique (user_id)
);

alter table public.empresa_usuarios enable row level security;

-- Service role: acceso total
create policy "service_all_empresa_usuarios" on public.empresa_usuarios
  for all to service_role using (true) with check (true);

-- Admin: acceso total
create policy "admin_all_empresa_usuarios" on public.empresa_usuarios
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Usuario autenticado: lee su propio registro
create policy "user_read_own_empresa_usuario" on public.empresa_usuarios
  for select to authenticated
  using (user_id = auth.uid());

-- Owner activo: lee todos los usuarios de su empresa
create policy "owner_read_empresa_users" on public.empresa_usuarios
  for select to authenticated
  using (
    cliente_id in (
      select cliente_id from public.empresa_usuarios
      where user_id = auth.uid() and role = 'owner' and status = 'active'
    )
  );

-- Owner activo: actualiza usuarios de su empresa (excepto a sí mismo)
create policy "owner_update_empresa_users" on public.empresa_usuarios
  for update to authenticated
  using (
    user_id != auth.uid() and
    cliente_id in (
      select cliente_id from public.empresa_usuarios
      where user_id = auth.uid() and role = 'owner' and status = 'active'
    )
  )
  with check (
    cliente_id in (
      select cliente_id from public.empresa_usuarios
      where user_id = auth.uid() and role = 'owner' and status = 'active'
    )
  );

-- ─── Actualizar RLS de clientes ───────────────────────────────────────────────

drop policy if exists "auth_select_own_cliente" on public.clientes;
drop policy if exists "auth_update_own_cliente" on public.clientes;

create policy "auth_select_own_cliente" on public.clientes
  for select to authenticated
  using (
    public.is_admin() or
    id in (
      select cliente_id from public.empresa_usuarios
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "auth_update_own_cliente" on public.clientes
  for update to authenticated
  using (
    public.is_admin() or
    id in (
      select cliente_id from public.empresa_usuarios
      where user_id = auth.uid() and status = 'active' and can_edit_company = true
    )
  )
  with check (
    public.is_admin() or
    id in (
      select cliente_id from public.empresa_usuarios
      where user_id = auth.uid() and status = 'active' and can_edit_company = true
    )
  );

-- ─── Actualizar RLS de proyectos ──────────────────────────────────────────────

drop policy if exists "auth_select_proyectos" on public.proyectos;

create policy "auth_select_proyectos" on public.proyectos
  for select to authenticated
  using (
    public.is_admin() or
    cliente_id in (
      select cliente_id from public.empresa_usuarios
      where user_id = auth.uid() and status = 'active' and can_view_projects = true
    )
  );

-- ─── Actualizar RLS de sesiones_proyecto ──────────────────────────────────────

drop policy if exists "auth_select_sesiones" on public.sesiones_proyecto;

create policy "auth_select_sesiones" on public.sesiones_proyecto
  for select to authenticated
  using (
    public.is_admin() or
    proyecto_id in (
      select p.id from public.proyectos p
      join public.empresa_usuarios eu on eu.cliente_id = p.cliente_id
      where eu.user_id = auth.uid() and eu.status = 'active' and eu.can_view_sessions = true
    )
  );

-- ─── Migrar usuarios existentes como owner ────────────────────────────────────
-- Los usuarios de Auth cuyo email coincide con clientes.correo se insertan como owner activo.

insert into public.empresa_usuarios (
  cliente_id, user_id, correo_usuario, role,
  can_book_sessions, can_view_projects, can_view_sessions, can_edit_company,
  status
)
select
  c.id,
  u.id,
  lower(u.email),
  'owner',
  true, true, true, true,
  'active'
from public.clientes c
join auth.users u on lower(u.email) = lower(c.correo)
on conflict (user_id) do nothing;
