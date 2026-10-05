import type { PGlite } from '@electric-sql/pglite';

export type NombreTamano = 'Único' | 'Chica' | 'Grande';

async function idCatalogo(db: PGlite, tabla: 'proveedores' | 'categorias_insumo' | 'categorias_producto', nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into ${tabla} (nombre) values ($1)
     on conflict (nombre) do update set nombre = excluded.nombre
     returning id`,
    [nombre],
  );
  return r.rows[0].id;
}

export async function crearInsumo(
  db: PGlite,
  o: { nombre: string; costoPaquete: number; presentacion: number; unidad?: 'gr' | 'ml' | 'pza'; activo?: boolean },
): Promise<string> {
  const proveedor = await idCatalogo(db, 'proveedores', 'PROVEEDOR PRUEBA');
  const categoria = await idCatalogo(db, 'categorias_insumo', 'CATEGORIA PRUEBA');
  const r = await db.query<{ id: string }>(
    `insert into insumos (nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad, activo)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [o.nombre, proveedor, categoria, o.costoPaquete, o.presentacion, o.unidad ?? 'gr', o.activo ?? true],
  );
  return r.rows[0].id;
}
