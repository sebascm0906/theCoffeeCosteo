-- Reserva atómica: los límites sobreviven a reinicios y múltiples instancias.
create table public.chat_cupos (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  consultas integer not null default 0,
  ventana timestamptz not null,
  consultas_ventana integer not null default 0,
  primary key (usuario_id, dia)
);
create index chat_cupos_dia on public.chat_cupos(dia);
alter table public.chat_cupos enable row level security;
revoke all on public.chat_cupos from anon, authenticated;

create function public.reservar_consulta_chat() returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  usuario uuid := auth.uid();
  ahora timestamptz := clock_timestamp();
  fecha date := (ahora at time zone 'UTC')::date;
  cupo public.chat_cupos%rowtype;
begin
  if usuario is null or (auth.jwt()->>'client_id') is not null
    or not exists (select 1 from public.perfiles where user_id = usuario and activo) then
    raise exception 'Se requiere una sesión activa del portal' using errcode = '42501';
  end if;
  -- Serializa todas las reservas, incluyendo el límite global de 300/día.
  perform pg_advisory_xact_lock(610060010);
  if coalesce((select sum(consultas) from public.chat_cupos where dia = fecha), 0) >= 300 then
    return false;
  end if;
  insert into public.chat_cupos(usuario_id, dia, ventana)
    values (usuario, fecha, ahora) on conflict do nothing;
  select * into cupo from public.chat_cupos where usuario_id = usuario and dia = fecha for update;
  if cupo.consultas >= 60 then return false; end if;
  if ahora >= cupo.ventana + interval '1 minute' then
    cupo.ventana := ahora;
    cupo.consultas_ventana := 0;
  end if;
  if cupo.consultas_ventana >= 5 then return false; end if;
  update public.chat_cupos set consultas = consultas + 1,
    ventana = cupo.ventana, consultas_ventana = cupo.consultas_ventana + 1
    where usuario_id = usuario and dia = fecha;
  return true;
end $$;
revoke all on function public.reservar_consulta_chat() from public, anon;
grant execute on function public.reservar_consulta_chat() to authenticated;
