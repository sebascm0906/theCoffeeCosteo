-- Un orden común de bloqueos antes de tocar filas evita ciclos de espera entre
-- editores, triggers de ciclos y escrituras directas del API.
create function bloquear_edicion_receta() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('receta_lineas_ciclo'));
  return null;
end $$;
revoke all on function bloquear_edicion_receta() from public, anon, authenticated;
do $$ declare t text;
begin
  foreach t in array array['recetas','receta_lineas','linea_cantidades','producto_tamanos','precio_canal_manual'] loop
    execute format('create trigger serializar_edicion before insert or update or delete on %I for each statement execute function bloquear_edicion_receta()', t);
  end loop;
end $$;

-- Solo el trigger puede tocar la versión de la cabecera cuando Finanzas modifica precios.
create function versionar_componentes_receta() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_receta uuid;
begin
  if tg_table_name = 'receta_lineas' then
    v_receta := case when tg_op = 'DELETE' then old.receta_id else new.receta_id end;
  elsif tg_table_name = 'linea_cantidades' then
    select receta_id into v_receta from public.receta_lineas
      where id = case when tg_op = 'DELETE' then old.linea_id else new.linea_id end;
  else
    v_receta := case when tg_op = 'DELETE' then old.producto_id else new.producto_id end;
  end if;
  update public.recetas set version = version where id = v_receta;
  return null;
end $$;
revoke all on function versionar_componentes_receta() from public, anon, authenticated;
do $$ declare t text;
begin
  foreach t in array array['receta_lineas','linea_cantidades','producto_tamanos','precio_canal_manual'] loop
    execute format('create trigger versionar_componentes after insert or update or delete on %I for each row execute function versionar_componentes_receta()', t);
  end loop;
end $$;

-- Auditoría antes del cascade: la línea todavía existe y conserva receta_id.
create function auditar_baja_cantidad() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null or current_setting('app.origen', true) is distinct from 'migracion' then
    insert into public.bitacora (tabla, registro_id, receta_id, campo, valor_anterior, usuario_id, origen)
    select 'linea_cantidades', concat_ws(':', old.linea_id, old.tamano_id), l.receta_id, '*', to_jsonb(old)::text, auth.uid(),
      case when current_setting('app.origen', true) = 'carga_masiva' then 'carga_masiva' else 'portal' end
    from public.receta_lineas l where l.id = old.linea_id;
  end if;
  return old;
end $$;
revoke all on function auditar_baja_cantidad() from public, anon, authenticated;
drop trigger linea_cantidades_bitacora on linea_cantidades;
create trigger linea_cantidades_bitacora_cambio after insert or update on linea_cantidades
  for each row execute function registrar_bitacora();
create trigger linea_cantidades_bitacora_baja before delete on linea_cantidades
  for each row execute function auditar_baja_cantidad();

create function limpiar_cantidades_antes_de_linea() returns trigger language plpgsql as $$
begin
  delete from public.linea_cantidades where linea_id = old.id;
  return old;
end $$;
revoke all on function limpiar_cantidades_antes_de_linea() from public, anon, authenticated;
create trigger receta_lineas_limpiar before delete on receta_lineas
  for each row execute function limpiar_cantidades_antes_de_linea();

create function guardar_receta(p_datos jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id uuid := nullif(p_datos->>'id', '')::uuid;
  v_version integer;
  v_tipo text := p_datos->>'tipo';
  v_linea jsonb;
  v_cantidad jsonb;
  v_linea_id uuid;
  v_tamano uuid;
begin
  if not public.tiene_rol('operaciones', 'admin') then
    raise exception 'No tienes permiso para editar recetas' using errcode = '42501';
  end if;
  if p_datos - array['id','version','nombre','tipo','categoria_id','rendimiento','unidad_rendimiento','activo','tamanos','lineas'] <> '{}'::jsonb then
    raise exception 'El guardado de receta no acepta precios ni campos desconocidos';
  end if;
  if jsonb_typeof(p_datos->'lineas') is distinct from 'array'
     or jsonb_typeof(p_datos->'tamanos') is distinct from 'array' then
    raise exception 'Indica líneas y tamaños válidos';
  end if;
  perform pg_advisory_xact_lock(hashtext('receta_lineas_ciclo'));
  if v_id is null then
    insert into public.recetas (nombre, tipo, categoria_id, rendimiento, unidad_rendimiento, activo)
    values (p_datos->>'nombre', v_tipo, nullif(p_datos->>'categoria_id','')::uuid,
      (p_datos->>'rendimiento')::numeric, (p_datos->>'unidad_rendimiento')::public.unidad,
      coalesce((p_datos->>'activo')::boolean, true)) returning id into v_id;
  else
    select version into v_version from public.recetas where id = v_id for update;
    if not found then raise exception 'Receta no encontrada'; end if;
    if (p_datos->>'version')::integer is distinct from v_version then
      raise exception 'La receta cambió; revisa la versión más reciente' using errcode = '40001';
    end if;
    update public.recetas set nombre = p_datos->>'nombre', tipo = v_tipo,
      categoria_id = nullif(p_datos->>'categoria_id','')::uuid,
      rendimiento = (p_datos->>'rendimiento')::numeric,
      unidad_rendimiento = (p_datos->>'unidad_rendimiento')::public.unidad,
      activo = coalesce((p_datos->>'activo')::boolean, true) where id = v_id;
  end if;
  if v_tipo = 'producto' then
    if jsonb_array_length(p_datos->'tamanos') = 0 then raise exception 'Selecciona al menos un tamaño'; end if;
    delete from public.producto_tamanos where producto_id = v_id
      and tamano_id not in (select value::text::uuid from jsonb_array_elements_text(p_datos->'tamanos'));
    for v_tamano in select value::uuid from jsonb_array_elements_text(p_datos->'tamanos') loop
      insert into public.producto_tamanos(producto_id, tamano_id) values(v_id, v_tamano) on conflict do nothing;
    end loop;
  elsif jsonb_array_length(p_datos->'tamanos') <> 0 then
    raise exception 'Las sub-recetas no llevan tamaños';
  end if;
  -- Rechazar líneas ajenas antes de borrar cualquier dato.
  if exists(select 1 from jsonb_array_elements(p_datos->'lineas') x
    where nullif(x->>'id','') is not null and not exists
      (select 1 from public.receta_lineas l where l.id = (x->>'id')::uuid and l.receta_id = v_id)) then
    raise exception 'Una línea no pertenece a esta receta';
  end if;
  if (select count(*) <> count(distinct x->>'id') from jsonb_array_elements(p_datos->'lineas') x where nullif(x->>'id','') is not null) then
    raise exception 'Línea repetida';
  end if;
  -- Borrar cantidades explícitamente antes de líneas para conservar el vínculo de auditoría.
  delete from public.linea_cantidades where linea_id in
    (select id from public.receta_lineas where receta_id = v_id and id not in
      (select (x->>'id')::uuid from jsonb_array_elements(p_datos->'lineas') x where nullif(x->>'id','') is not null));
  delete from public.receta_lineas where receta_id = v_id and id not in
    (select (x->>'id')::uuid from jsonb_array_elements(p_datos->'lineas') x where nullif(x->>'id','') is not null);
  for v_linea in select value from jsonb_array_elements(p_datos->'lineas') loop
    if v_linea - array['id','insumo_id','subreceta_id','orden','cantidades'] <> '{}'::jsonb
      or jsonb_typeof(v_linea->'cantidades') is distinct from 'array' then raise exception 'Línea inválida'; end if;
    if not exists(select 1 from public.insumos where id = nullif(v_linea->>'insumo_id','')::uuid and activo)
      and not exists(select 1 from public.recetas where id = nullif(v_linea->>'subreceta_id','')::uuid and tipo = 'subreceta' and activo) then
      -- Una referencia inactiva ya guardada puede conservarse.
      if not exists(select 1 from public.receta_lineas where id = nullif(v_linea->>'id','')::uuid and receta_id = v_id
        and insumo_id is not distinct from nullif(v_linea->>'insumo_id','')::uuid
        and subreceta_id is not distinct from nullif(v_linea->>'subreceta_id','')::uuid) then raise exception 'El componente está inactivo o no existe'; end if;
    end if;
    v_linea_id := nullif(v_linea->>'id','')::uuid;
    if v_linea_id is null then
      insert into public.receta_lineas(receta_id, insumo_id, subreceta_id, orden)
      values(v_id, nullif(v_linea->>'insumo_id','')::uuid, nullif(v_linea->>'subreceta_id','')::uuid, (v_linea->>'orden')::integer)
      returning id into v_linea_id;
    else
      update public.receta_lineas set insumo_id = nullif(v_linea->>'insumo_id','')::uuid,
        subreceta_id = nullif(v_linea->>'subreceta_id','')::uuid, orden = (v_linea->>'orden')::integer where id = v_linea_id;
    end if;
    delete from public.linea_cantidades where linea_id = v_linea_id;
    for v_cantidad in select value from jsonb_array_elements(v_linea->'cantidades') loop
      insert into public.linea_cantidades(linea_id, tamano_id, cantidad)
      values(v_linea_id, nullif(v_cantidad->>'tamano_id','')::uuid, (v_cantidad->>'cantidad')::numeric);
    end loop;
  end loop;
  select version into v_version from public.recetas where id = v_id;
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;
revoke all on function guardar_receta(jsonb) from public, anon, authenticated;
grant execute on function guardar_receta(jsonb) to authenticated;
