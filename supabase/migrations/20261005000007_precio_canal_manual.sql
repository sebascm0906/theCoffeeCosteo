-- Los objetos nuevos empiezan cerrados para authenticated (Supabase Cloud le da ALL por defecto); cada objeto concede lo suyo.
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from authenticated;

-- Precio de canal capturado a mano (decisiones de precio aprobadas que no salen de la fórmula).
create table precio_canal_manual (
  producto_id uuid not null,
  tamano_id uuid not null,
  canal_id uuid not null references canales(id),
  precio numeric not null check (precio > 0),
  nota text,
  primary key (producto_id, tamano_id, canal_id),
  foreign key (producto_id, tamano_id) references producto_tamanos(producto_id, tamano_id) on delete cascade
);

alter table precio_canal_manual enable row level security;
create policy lectura on precio_canal_manual for select to authenticated using (true);
create policy alta on precio_canal_manual for insert to authenticated with check (public.tiene_rol('finanzas', 'admin'));
create policy cambio on precio_canal_manual for update to authenticated
  using (public.tiene_rol('finanzas', 'admin')) with check (public.tiene_rol('finanzas', 'admin'));
create policy baja on precio_canal_manual for delete to authenticated using (public.tiene_rol('finanzas', 'admin'));
revoke all on precio_canal_manual from anon, authenticated;
grant select, insert, update, delete on precio_canal_manual to authenticated;

create function vigilar_precio_canal_manual() returns trigger language plpgsql as $$
begin
  if (new.producto_id, new.tamano_id, new.canal_id) is distinct from (old.producto_id, old.tamano_id, old.canal_id) then
    raise exception 'No se puede cambiar el producto, el tamaño o el canal de un precio manual; elimínalo y créalo de nuevo';
  end if;
  return new;
end $$;
create trigger precio_canal_manual_vigilar before update on precio_canal_manual
  for each row execute function vigilar_precio_canal_manual();

-- Misma función de bitácora, con receta y registro para precio_canal_manual.
create or replace function registrar_bitacora() returns trigger
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
                         concat_ws(':', v_fila ->> 'producto_id', v_fila ->> 'linea_id', v_fila ->> 'tamano_id', v_fila ->> 'canal_id'));
  v_receta := case tg_table_name
    when 'recetas' then (v_fila ->> 'id')::uuid
    when 'producto_tamanos' then (v_fila ->> 'producto_id')::uuid
    when 'precio_canal_manual' then (v_fila ->> 'producto_id')::uuid
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

create trigger precio_canal_manual_bitacora after insert or update or delete on precio_canal_manual
  for each row execute function registrar_bitacora();

-- v_resumen: el precio manual (si existe y hay precio de lista) gana sobre el calculado.
drop view v_alerta_producto_canal;
drop view v_resumen;

create view v_resumen with (security_invoker = true) as
with base as (
  select
    r.id as producto_id, r.nombre as producto, r.activo,
    cp.id as categoria_id, cp.nombre as categoria,
    t.id as tamano_id, t.nombre as tamano, t.orden as tamano_orden,
    c.id as canal_id, c.nombre as canal, c.orden as canal_orden, c.regla_precio,
    c.comision_pct, c.comision_confirmada, c.costo_envase, c.markup_max_pct,
    nullif(pt.precio_lista, 0) as precio_lista,
    pm.precio as precio_manual_capturado,
    cpr.costo, cpr.usa_inactivo,
    par.iva, par.margen_objetivo
  from producto_tamanos pt
  join recetas r on r.id = pt.producto_id
  join categorias_producto cp on cp.id = r.categoria_id
  join tamanos t on t.id = pt.tamano_id
  join v_costo_producto cpr on cpr.producto_id = pt.producto_id and cpr.tamano_id = pt.tamano_id
  cross join canales c
  cross join parametros par
  left join precio_canal_manual pm
    on pm.producto_id = pt.producto_id and pm.tamano_id = pt.tamano_id and pm.canal_id = c.id
),
con_calculado as (
  select b.*,
    case
      when b.precio_lista is null then null
      when b.regla_precio = 'mostrador' then b.precio_lista
      else least(
        round(b.precio_lista / (1 - b.comision_pct) + b.costo_envase * (1 + b.iva) / (1 - b.comision_pct), 0),
        case when b.markup_max_pct is null then null else floor(b.precio_lista * (1 + b.markup_max_pct)) end
      )
    end as precio_calculado,
    case when b.precio_lista is null then null else b.precio_manual_capturado end as precio_manual
  from base b
),
con_precio as (
  select c.*, coalesce(c.precio_manual, c.precio_calculado) as precio_canal from con_calculado c
),
con_venta as (
  select p.*, p.precio_canal / (1 + p.iva) as venta_neta from con_precio p
)
select
  v.producto_id, v.producto, v.activo, v.categoria_id, v.categoria, v.tamano_id, v.tamano, v.tamano_orden,
  v.canal_id, v.canal, v.canal_orden, v.regla_precio, v.comision_pct, v.comision_confirmada, v.costo_envase,
  v.markup_max_pct, v.precio_lista, v.costo, v.usa_inactivo, v.iva, v.margen_objetivo,
  v.precio_calculado, v.precio_manual, v.precio_canal, v.venta_neta,
  v.costo / v.venta_neta as food_cost,
  v.venta_neta - v.venta_neta * v.comision_pct - v.costo - v.costo_envase as margen,
  (v.venta_neta - v.venta_neta * v.comision_pct - v.costo - v.costo_envase) / v.venta_neta as margen_pct,
  v.precio_canal / v.precio_lista - 1 as markup
from con_venta v;

-- Una alerta por producto y canal, en el mismo orden de prioridad que el Excel (sin cambios de lógica).
create view v_alerta_producto_canal with (security_invoker = true) as
select
  producto_id, producto, categoria, canal_id, canal, canal_orden,
  case
    when bool_and(precio_lista is null) then 'Falta precio de lista'
    when bool_or(precio_lista is not null and costo > precio_lista / (1 + iva)) then 'Vende por debajo del costo'
    when bool_or(markup_max_pct is not null and markup > markup_max_pct + 0.001) then 'Markup sobre el tope'
    when bool_or(margen < 0) then 'Pierde dinero en el canal'
    when bool_or(precio_lista is not null
                 and 1 - costo / (precio_lista / (1 + iva)) > 0
                 and 1 - costo / (precio_lista / (1 + iva)) < margen_objetivo) then 'Margen bajo el objetivo'
    when bool_or(usa_inactivo) then 'Usa insumo inactivo'
  end as alerta
from v_resumen
group by producto_id, producto, categoria, canal_id, canal, canal_orden;

revoke all on v_resumen, v_alerta_producto_canal from anon, authenticated;
grant select on v_resumen, v_alerta_producto_canal to authenticated;
