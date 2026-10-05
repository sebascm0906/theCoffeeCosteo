revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on parametros, canales, tamanos, proveedores, categorias_insumo, categorias_producto,
  insumos, recetas, producto_tamanos, receta_lineas, linea_cantidades, perfiles to authenticated;
grant delete on producto_tamanos, receta_lineas, linea_cantidades to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

do $$
declare t text;
begin
  foreach t in array array['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo', 'categorias_producto',
                           'insumos', 'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'perfiles', 'bitacora'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy lectura on %I for select to authenticated using (true)', t);
  end loop;
end $$;

create function crear_politicas_escritura(tabla text, roles text[], con_borrado boolean) returns void
language plpgsql as $$
declare
  condicion text := format('public.tiene_rol(variadic %L::text[])', roles);
begin
  execute format('create policy alta on %I for insert to authenticated with check (%s)', tabla, condicion);
  execute format('create policy cambio on %I for update to authenticated using (%s) with check (%s)', tabla, condicion, condicion);
  if con_borrado then
    execute format('create policy baja on %I for delete to authenticated using (%s)', tabla, condicion);
  end if;
end $$;

select crear_politicas_escritura('proveedores', array['compras', 'admin'], false);
select crear_politicas_escritura('categorias_insumo', array['compras', 'admin'], false);
select crear_politicas_escritura('insumos', array['compras', 'admin'], false);
select crear_politicas_escritura('categorias_producto', array['operaciones', 'admin'], false);
select crear_politicas_escritura('recetas', array['operaciones', 'admin'], false);
select crear_politicas_escritura('receta_lineas', array['operaciones', 'admin'], true);
select crear_politicas_escritura('linea_cantidades', array['operaciones', 'admin'], true);
select crear_politicas_escritura('parametros', array['finanzas', 'admin'], false);
select crear_politicas_escritura('canales', array['finanzas', 'admin'], false);
select crear_politicas_escritura('tamanos', array['finanzas', 'admin'], false);
select crear_politicas_escritura('perfiles', array['admin'], false);
drop function crear_politicas_escritura(text, text[], boolean);

-- producto_tamanos: Operaciones decide qué tamaños vende un producto; Finanzas captura el precio.
create policy alta on producto_tamanos for insert to authenticated with check (tiene_rol('operaciones', 'admin'));
create policy baja on producto_tamanos for delete to authenticated using (tiene_rol('operaciones', 'admin'));
create policy cambio on producto_tamanos for update to authenticated
  using (tiene_rol('operaciones', 'finanzas', 'admin')) with check (tiene_rol('operaciones', 'finanzas', 'admin'));

create function vigilar_producto_tamanos() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.producto_id, new.tamano_id) is distinct from (old.producto_id, old.tamano_id) then
    raise exception 'No se puede cambiar el producto o el tamaño de un registro; elimínalo y créalo de nuevo';
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.precio_lista is not null and not tiene_rol('finanzas', 'admin') then
      raise exception 'Solo Finanzas puede capturar precios de lista';
    end if;
  else
    if new.precio_lista is distinct from old.precio_lista and not tiene_rol('finanzas', 'admin') then
      raise exception 'Solo Finanzas puede capturar precios de lista';
    end if;
  end if;
  return new;
end $$;
create trigger producto_tamanos_vigilar before insert or update on producto_tamanos
  for each row execute function vigilar_producto_tamanos();
