-- Fix infinite recursion in empresa_usuarios RLS policies.
-- Policies that reference empresa_usuarios from within empresa_usuarios policies
-- cause recursion. The fix is SECURITY DEFINER helper functions that bypass RLS.

create or replace function public.my_empresa_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cliente_id from public.empresa_usuarios
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_empresa_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.empresa_usuarios
    where user_id = auth.uid() and role = 'owner' and status = 'active'
  );
$$;

-- Recrear las dos políticas que causaban recursión
drop policy if exists "owner_read_empresa_users"   on public.empresa_usuarios;
drop policy if exists "owner_update_empresa_users" on public.empresa_usuarios;

create policy "owner_read_empresa_users" on public.empresa_usuarios
  for select to authenticated
  using (
    public.is_empresa_owner() and
    cliente_id = public.my_empresa_cliente_id()
  );

create policy "owner_update_empresa_users" on public.empresa_usuarios
  for update to authenticated
  using (
    user_id != auth.uid() and
    public.is_empresa_owner() and
    cliente_id = public.my_empresa_cliente_id()
  )
  with check (
    public.is_empresa_owner() and
    cliente_id = public.my_empresa_cliente_id()
  );
