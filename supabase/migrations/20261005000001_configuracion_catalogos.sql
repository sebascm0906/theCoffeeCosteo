create type unidad as enum ('gr', 'ml', 'pza');

create function tocar_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create table parametros (
  id smallint primary key default 1 check (id = 1),
  iva numeric not null check (iva >= 0 and iva < 1),
  margen_objetivo numeric not null check (margen_objetivo >= 0 and margen_objetivo < 1),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into parametros (iva, margen_objetivo) values (0.16, 0.55);
create trigger parametros_updated before update on parametros for each row execute function tocar_updated_at();

create table canales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  regla_precio text not null check (regla_precio in ('mostrador', 'castigado')),
  comision_pct numeric not null default 0 check (comision_pct >= 0 and comision_pct < 1),
  comision_confirmada boolean not null default true,
  costo_envase numeric not null default 0 check (costo_envase >= 0),
  markup_max_pct numeric check (markup_max_pct >= 0),
  orden smallint not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into canales (nombre, regla_precio, comision_pct, comision_confirmada, costo_envase, markup_max_pct, orden) values
  ('Mostrador', 'mostrador', 0, true, 0, null, 1),
  ('Rappi', 'castigado', 0.18, true, 6.14, 0.25, 2),
  ('App propia', 'mostrador', 0, false, 6.14, null, 3);
create trigger canales_updated before update on canales for each row execute function tocar_updated_at();

create table tamanos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  orden smallint not null
);
insert into tamanos (nombre, orden) values ('Único', 0), ('Chica', 1), ('Grande', 2);

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  activo boolean not null default true
);

create table categorias_insumo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  activo boolean not null default true
);

create table categorias_producto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  orden smallint not null default 0,
  activo boolean not null default true
);

create table insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  proveedor_id uuid not null references proveedores(id),
  categoria_id uuid not null references categorias_insumo(id),
  costo_paquete numeric not null check (costo_paquete >= 0),
  presentacion numeric not null check (presentacion > 0),
  unidad unidad not null,
  costo_unitario numeric generated always as (costo_paquete / presentacion) stored,
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create trigger insumos_updated before update on insumos for each row execute function tocar_updated_at();
