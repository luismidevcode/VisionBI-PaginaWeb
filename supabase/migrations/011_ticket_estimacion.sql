-- Estimación de horas para tickets de prioridad crítica.
-- Antes de "Iniciar progreso" en un ticket crítico, el asignado debe proponer
-- una estimación en horas y el creador debe aceptarla.
--
-- estimacion_estado:
--   'no_requerida' -> prioridad != 'critica', no aplica el flujo
--   'pendiente'    -> falta que el asignado proponga horas (o el creador rechazó y debe reproponer)
--   'en_revision'  -> el asignado propuso horas, falta que el creador las acepte/rechace
--   'aceptada'     -> el creador aceptó, ya se puede iniciar progreso
--   'rechazada'    -> el creador rechazó con comentario; el asignado debe reproponer

alter table public.tickets
  add column estimacion_horas numeric,
  add column estimacion_estado text not null default 'no_requerida'
    check (estimacion_estado in ('no_requerida','pendiente','en_revision','aceptada','rechazada')),
  add column estimacion_comentario_rechazo text;

update public.tickets
set estimacion_estado = 'pendiente'
where prioridad = 'critica' and estado = 'abierto';

alter table public.ticket_actividad drop constraint ticket_actividad_tipo_check;
alter table public.ticket_actividad add constraint ticket_actividad_tipo_check
  check (tipo in ('estado','comentario','asignacion','estimacion'));
