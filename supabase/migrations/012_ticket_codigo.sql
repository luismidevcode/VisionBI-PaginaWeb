-- Código legible para identificar tickets (ej: CRI-00007).
-- El prefijo codifica la prioridad del ticket (BAJ/MED/ALT/CRI) para poder
-- distinguir de un vistazo su urgencia, seguido de un consecutivo global.
-- La fecha y hora de creación se muestran aparte, en la tabla de tickets.

create sequence if not exists public.tickets_codigo_seq;

alter table public.tickets add column codigo text;

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

create trigger trg_set_ticket_codigo
  before insert on public.tickets
  for each row execute function public.set_ticket_codigo();

-- Backfill de tickets existentes, en orden cronológico.
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

select setval('public.tickets_codigo_seq', (select count(*) from public.tickets));

alter table public.tickets alter column codigo set not null;
alter table public.tickets add constraint tickets_codigo_key unique (codigo);
