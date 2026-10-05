create table recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  tipo text not null check (tipo in ('producto', 'subreceta')),
  categoria_id uuid references categorias_producto(id),
  rendimiento numeric check (rendimiento > 0),
  unidad_rendimiento unidad,
  activo boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (
    (tipo = 'producto' and categoria_id is not null and rendimiento is null and unidad_rendimiento is null)
    or (tipo = 'subreceta' and rendimiento is not null and unidad_rendimiento is not null)
  )
);

create function antes_de_actualizar_receta() returns trigger language plpgsql as $$
begin
  if new.tipo <> old.tipo then
    raise exception 'No se puede cambiar el tipo de una receta';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger recetas_antes_update before update on recetas for each row execute function antes_de_actualizar_receta();

create table producto_tamanos (
  producto_id uuid not null references recetas(id) on delete cascade,
  tamano_id uuid not null references tamanos(id),
  precio_lista numeric check (precio_lista > 0),
  primary key (producto_id, tamano_id)
);

create function validar_producto_tamano() returns trigger language plpgsql as $$
begin
  if (select tipo from recetas where id = new.producto_id) is distinct from 'producto' then
    raise exception 'Solo los productos tienen tamaños y precio de lista';
  end if;
  return new;
end $$;
create trigger producto_tamanos_validar before insert or update on producto_tamanos
  for each row execute function validar_producto_tamano();

create table receta_lineas (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references recetas(id) on delete cascade,
  insumo_id uuid references insumos(id),
  subreceta_id uuid references recetas(id),
  orden integer not null default 0,
  check (num_nonnulls(insumo_id, subreceta_id) = 1)
);
create index receta_lineas_receta on receta_lineas (receta_id);
create index receta_lineas_insumo on receta_lineas (insumo_id);
create index receta_lineas_subreceta on receta_lineas (subreceta_id);

create function validar_receta_linea() returns trigger language plpgsql as $$
declare
  v_tipo text;
  v_ciclo boolean;
begin
  if new.subreceta_id is null then
    return new;
  end if;
  select tipo into v_tipo from recetas where id = new.subreceta_id;
  if v_tipo is distinct from 'subreceta' then
    raise exception 'Solo se pueden usar sub-recetas como componente';
  end if;
  with recursive contenidas (id) as (
    select new.subreceta_id
    union
    select l.subreceta_id
    from receta_lineas l
    join contenidas c on l.receta_id = c.id
    where l.subreceta_id is not null
  )
  select exists (select 1 from contenidas where id = new.receta_id) into v_ciclo;
  if v_ciclo then
    raise exception '% ya contiene a %',
      (select nombre from recetas where id = new.subreceta_id),
      (select nombre from recetas where id = new.receta_id);
  end if;
  return new;
end $$;
create trigger receta_lineas_validar before insert or update on receta_lineas
  for each row execute function validar_receta_linea();

create table linea_cantidades (
  linea_id uuid not null references receta_lineas(id) on delete cascade,
  tamano_id uuid references tamanos(id),
  cantidad numeric not null check (cantidad >= 0)
);
create unique index linea_cantidades_unica on linea_cantidades (linea_id, tamano_id) nulls not distinct;

create function validar_linea_cantidad() returns trigger language plpgsql as $$
declare
  v_receta uuid;
  v_tipo text;
begin
  select l.receta_id, r.tipo into v_receta, v_tipo
  from receta_lineas l join recetas r on r.id = l.receta_id
  where l.id = new.linea_id;
  if v_tipo = 'subreceta' then
    if new.tamano_id is not null then
      raise exception 'Las cantidades de una sub-receta no llevan tamaño';
    end if;
  else
    if new.tamano_id is null then
      raise exception 'Indica el tamaño de la cantidad';
    end if;
    if not exists (select 1 from producto_tamanos where producto_id = v_receta and tamano_id = new.tamano_id) then
      raise exception 'El producto no se vende en ese tamaño';
    end if;
  end if;
  return new;
end $$;
create trigger linea_cantidades_validar before insert or update on linea_cantidades
  for each row execute function validar_linea_cantidad();

create function limpiar_cantidades_de_tamano() returns trigger language plpgsql as $$
begin
  delete from linea_cantidades lc
  using receta_lineas l
  where lc.linea_id = l.id and l.receta_id = old.producto_id and lc.tamano_id = old.tamano_id;
  return old;
end $$;
create trigger producto_tamanos_limpiar after delete on producto_tamanos
  for each row execute function limpiar_cantidades_de_tamano();
