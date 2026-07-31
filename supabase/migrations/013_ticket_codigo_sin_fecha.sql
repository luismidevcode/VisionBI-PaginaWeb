-- La migración 012 ya se ejecutó en producción con el formato antiguo
-- (PREFIJO-YYYYMMDD-CONSECUTIVO). Esta migración corrige hacia adelante sin
-- tocar la estructura existente (columna, secuencia, constraint not null /
-- unique ya creados) para no perder los tickets ya guardados:
--   1. Reemplaza la función del trigger para que el código ya no incluya fecha.
--   2. Recalcula los códigos existentes al nuevo formato PREFIJO-CONSECUTIVO.

create or replace function public.set_ticket_codigo() returns trigger
language plpgsql as $$
declare
  prefijo text;
begin
  if new.codigo is null then
    prefijo := case new.prioridad
      when 'critica' then 'CRI'
      when 'alta'    then 'ALT'
      when 'media'   then 'MED'
      else 'BAJ'
    end;
    new.codigo := prefijo || '-' || lpad(nextval('public.tickets_codigo_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

-- Recalcula los códigos ya asignados (con fecha) al nuevo formato sin fecha,
-- conservando el orden cronológico original.
with numerados as (
  select id, row_number() over (order by created_at) as n
  from public.tickets
)
update public.tickets t
set codigo =
  (case t.prioridad
     when 'critica' then 'CRI'
     when 'alta'    then 'ALT'
     when 'media'   then 'MED'
     else 'BAJ'
   end) || '-' || lpad(numerados.n::text, 5, '0')
from numerados
where numerados.id = t.id;
