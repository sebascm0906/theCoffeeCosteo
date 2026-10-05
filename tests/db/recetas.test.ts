import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, crearSubreceta, idTamano } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
let cafe: string;
beforeAll(async () => {
  db = await crearDbLocal();
  cafe = await crearInsumo(db, { nombre: 'CAFE', costoPaquete: 400, presentacion: 1000 });
});

describe('recetas', () => {
  it('una línea lleva exactamente un insumo o una sub-receta', async () => {
    const p = await crearProducto(db, { nombre: 'P línea', precios: { Único: 50 } });
    await expect(db.query('insert into receta_lineas (receta_id) values ($1)', [p])).rejects.toThrow();
    const s = await crearSubreceta(db, { nombre: 'S línea', rendimiento: 100 });
    await expect(
      db.query('insert into receta_lineas (receta_id, insumo_id, subreceta_id) values ($1, $2, $3)', [p, cafe, s]),
    ).rejects.toThrow();
  });

  it('no permite usar un producto como si fuera sub-receta', async () => {
    const p1 = await crearProducto(db, { nombre: 'P uno', precios: { Único: 50 } });
    const p2 = await crearProducto(db, { nombre: 'P dos', precios: { Único: 50 } });
    await expect(agregarLinea(db, p1, { subrecetaId: p2, cantidades: { Único: 1 } })).rejects.toThrow(/sub-recetas/);
  });

  it('bloquea ciclos entre sub-recetas con un mensaje claro', async () => {
    const a = await crearSubreceta(db, { nombre: 'Mix A', rendimiento: 100 });
    const b = await crearSubreceta(db, { nombre: 'Mix B', rendimiento: 100 });
    await agregarLinea(db, a, { subrecetaId: b, cantidades: 10 });
    await expect(agregarLinea(db, b, { subrecetaId: a, cantidades: 10 })).rejects.toThrow('Mix A ya contiene a Mix B');
    await expect(agregarLinea(db, a, { subrecetaId: a, cantidades: 10 })).rejects.toThrow('ya contiene a Mix A');
  });

  it('no permite mover una línea a otra receta', async () => {
    const p1 = await crearProducto(db, { nombre: 'P mover uno', precios: { Único: 50 } });
    const p2 = await crearProducto(db, { nombre: 'P mover dos', precios: { Único: 50 } });
    const linea = await agregarLinea(db, p1, { insumoId: cafe, cantidades: { Único: 10 } });
    await expect(db.query('update receta_lineas set receta_id = $2 where id = $1', [linea, p2]))
      .rejects.toThrow('No se puede mover una línea a otra receta; elimínala y créala de nuevo');
  });

  it('solo acepta cantidades en tamaños que vende el producto', async () => {
    const p = await crearProducto(db, { nombre: 'P chica', precios: { Chica: 50 } });
    await expect(agregarLinea(db, p, { insumoId: cafe, cantidades: { Grande: 20 } })).rejects.toThrow(/no se vende en ese tamaño/);
  });

  it('las cantidades de sub-receta no llevan tamaño y las de producto sí', async () => {
    const s = await crearSubreceta(db, { nombre: 'S tamaños', rendimiento: 100 });
    await expect(agregarLinea(db, s, { insumoId: cafe, cantidades: { Chica: 1 } })).rejects.toThrow(/no llevan tamaño/);
    const p = await crearProducto(db, { nombre: 'P sin tamaño', precios: { Chica: 50 } });
    await expect(agregarLinea(db, p, { insumoId: cafe, cantidades: 5 })).rejects.toThrow(/Indica el tamaño/);
  });

  it('no repite cantidad para la misma línea y tamaño (incluido el null de sub-receta)', async () => {
    const s = await crearSubreceta(db, { nombre: 'S dup', rendimiento: 100 });
    const linea = await agregarLinea(db, s, { insumoId: cafe, cantidades: 5 });
    await expect(db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, null, 6)', [linea])).rejects.toThrow();
  });

  it('quitar un tamaño al producto borra sus cantidades de ese tamaño', async () => {
    const p = await crearProducto(db, { nombre: 'P quitar tamaño', precios: { Chica: 50, Grande: 60 } });
    const linea = await agregarLinea(db, p, { insumoId: cafe, cantidades: { Chica: 18, Grande: 20 } });
    await db.query('delete from producto_tamanos where producto_id = $1 and tamano_id = $2', [p, await idTamano(db, 'Grande')]);
    const r = await db.query<{ cantidad: string }>('select cantidad from linea_cantidades where linea_id = $1', [linea]);
    expect(r.rows.map((x) => num(x.cantidad))).toEqual([18]);
  });

  it('sube la versión de la receta en cada cambio y no deja cambiar su tipo', async () => {
    const p = await crearProducto(db, { nombre: 'P versión', precios: { Único: 50 } });
    const antes = await db.query<{ version: number }>('select version from recetas where id = $1', [p]);
    await db.query(`update recetas set nombre = 'P versión 2' where id = $1`, [p]);
    const r = await db.query<{ version: number }>('select version from recetas where id = $1', [p]);
    expect(r.rows[0].version).toBe(antes.rows[0].version + 1);
    await expect(db.query(`update recetas set tipo = 'subreceta', rendimiento = 1, unidad_rendimiento = 'ml', categoria_id = null where id = $1`, [p])).rejects.toThrow(/tipo/);
  });

  it('valida campos según el tipo de receta', async () => {
    await expect(db.query(`insert into recetas (nombre, tipo) values ('Sin categoría', 'producto')`)).rejects.toThrow();
    await expect(db.query(`insert into recetas (nombre, tipo) values ('Sin rendimiento', 'subreceta')`)).rejects.toThrow();
  });
});
