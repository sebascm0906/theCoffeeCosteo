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

export async function idTamano(db: PGlite, nombre: NombreTamano): Promise<string> {
  const r = await db.query<{ id: string }>('select id from tamanos where nombre = $1', [nombre]);
  if (!r.rows[0]) throw new Error(`No existe el tamaño ${nombre}`);
  return r.rows[0].id;
}

export async function crearProducto(
  db: PGlite,
  o: { nombre: string; precios: Partial<Record<NombreTamano, number | null>>; categoria?: string },
): Promise<string> {
  const categoria = await idCatalogo(db, 'categorias_producto', o.categoria ?? 'CATEGORIA PRODUCTO PRUEBA');
  const r = await db.query<{ id: string }>(
    `insert into recetas (nombre, tipo, categoria_id) values ($1, 'producto', $2) returning id`,
    [o.nombre, categoria],
  );
  const id = r.rows[0].id;
  for (const [tamano, precio] of Object.entries(o.precios) as [NombreTamano, number | null][]) {
    await db.query('insert into producto_tamanos (producto_id, tamano_id, precio_lista) values ($1, $2, $3)', [
      id, await idTamano(db, tamano), precio,
    ]);
  }
  return id;
}

export async function crearSubreceta(
  db: PGlite,
  o: { nombre: string; rendimiento: number; unidad?: 'gr' | 'ml' | 'pza' },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into recetas (nombre, tipo, rendimiento, unidad_rendimiento) values ($1, 'subreceta', $2, $3) returning id`,
    [o.nombre, o.rendimiento, o.unidad ?? 'ml'],
  );
  return r.rows[0].id;
}

export async function agregarLinea(
  db: PGlite,
  recetaId: string,
  o: { insumoId?: string; subrecetaId?: string; cantidades: Partial<Record<NombreTamano, number>> | number },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    'insert into receta_lineas (receta_id, insumo_id, subreceta_id) values ($1, $2, $3) returning id',
    [recetaId, o.insumoId ?? null, o.subrecetaId ?? null],
  );
  const lineaId = r.rows[0].id;
  if (typeof o.cantidades === 'number') {
    await db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, null, $2)', [lineaId, o.cantidades]);
  } else {
    for (const [tamano, cantidad] of Object.entries(o.cantidades) as [NombreTamano, number][]) {
      await db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, $2, $3)', [
        lineaId, await idTamano(db, tamano), cantidad,
      ]);
    }
  }
  return lineaId;
}
