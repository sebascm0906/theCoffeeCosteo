create table perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  rol text not null check (rol in ('compras', 'operaciones', 'finanzas', 'admin')),
  activo boolean not null default true
);

create function rol_actual() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select rol from public.perfiles where user_id = auth.uid() and activo
$$;

create function tiene_rol(variadic roles text[]) returns boolean
language sql stable as $$
  select coalesce(public.rol_actual() = any(roles), false)
$$;

create table bitacora (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text,
  receta_id uuid,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  nota text,
  usuario_id uuid,
  fecha timestamptz not null default now(),
  origen text not null default 'portal' check (origen in ('portal', 'carga_masiva', 'migracion'))
);
create index bitacora_registro on bitacora (registro_id);
create index bitacora_receta on bitacora (receta_id);
create index bitacora_fecha on bitacora (fecha desc);

create function registrar_bitacora() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_origen text := case current_setting('app.origen', true)
    when 'carga_masiva' then 'carga_masiva'
    when 'migracion' then case when auth.uid() is null then 'migracion' else 'portal' end
    else 'portal'
  end;
  v_viejo jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_nuevo jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_fila jsonb := coalesce(v_nuevo, v_viejo);
  v_registro text;
  v_receta uuid;
  v_campo text;
begin
  if v_origen = 'migracion' then
    return null;
  end if;
  v_registro := coalesce(v_fila ->> 'id', v_fila ->> 'user_id',
                         concat_ws(':', v_fila ->> 'producto_id', v_fila ->> 'linea_id', v_fila ->> 'tamano_id'));
  v_receta := case tg_table_name
    when 'recetas' then (v_fila ->> 'id')::uuid
    when 'producto_tamanos' then (v_fila ->> 'producto_id')::uuid
    when 'receta_lineas' then (v_fila ->> 'receta_id')::uuid
    when 'linea_cantidades' then (select receta_id from public.receta_lineas where id = (v_fila ->> 'linea_id')::uuid)
  end;
  if tg_op = 'UPDATE' then
    for v_campo in select jsonb_object_keys(v_nuevo) loop
      continue when v_campo = any (array['updated_at', 'updated_by', 'version', 'costo_unitario']);
      if (v_viejo -> v_campo) is distinct from (v_nuevo -> v_campo) then
        insert into public.bitacora (tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, usuario_id, origen)
        values (tg_table_name, v_registro, v_receta, v_campo, v_viejo ->> v_campo, v_nuevo ->> v_campo, auth.uid(), v_origen);
      end if;
    end loop;
  else
    insert into public.bitacora (tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, usuario_id, origen)
    values (tg_table_name, v_registro, v_receta, '*', v_viejo::text, v_nuevo::text, auth.uid(), v_origen);
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo', 'categorias_producto',
                           'insumos', 'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'perfiles'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function registrar_bitacora()',
                   t || '_bitacora', t);
  end loop;
end $$;
