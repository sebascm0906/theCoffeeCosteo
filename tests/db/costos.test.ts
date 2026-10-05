import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, crearSubreceta, idTamano } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
const costo = async (productoId: string, tamano: 'Único' | 'Chica' | 'Grande') => {
  const r = await db.query<{ costo: string; usa_inactivo: boolean }>(
    'select costo, usa_inactivo from v_costo_producto where producto_id = $1 and tamano_id = $2',
    [productoId, await idTamano(db, tamano)],
  );
  return { costo: num(r.rows[0].costo), usaInactivo: r.rows[0].usa_inactivo };
};

beforeAll(async () => { db = await crearDbLocal(); });

describe('v_costo_producto', () => {
  it('suma cantidad × costo unitario por tamaño', async () => {
    const cafe = await crearInsumo(db, { nombre: 'CAFE', costoPaquete: 400, presentacion: 1000 });
    const vaso = await crearInsumo(db, { nombre: 'VASO', costoPaquete: 100, presentacion: 50, unidad: 'pza' });
    const p = await crearProducto(db, { nombre: 'Latte', precios: { Chica: 65, Grande: 75 } });
    await agregarLinea(db, p, { insumoId: cafe, cantidades: { Chica: 18, Grande: 20 } });
    await agregarLinea(db, p, { insumoId: vaso, cantidades: { Chica: 1, Grande: 1 } });
    expect((await costo(p, 'Chica')).costo).toBeCloseTo(9.2, 10);
    expect((await costo(p, 'Grande')).costo).toBeCloseTo(10, 10);
  });

  it('usa el costo por unidad de rendimiento de la sub-receta', async () => {
    const matcha = await crearInsumo(db, { nombre: 'MATCHA', costoPaquete: 1200, presentacion: 1000 });
    const agua = await crearInsumo(db, { nombre: 'AGUA', costoPaquete: 0, presentacion: 1, unidad: 'ml' });
    const mix = await crearSubreceta(db, { nombre: 'Mix Matcha', rendimiento: 1000 });
    await agregarLinea(db, mix, { insumoId: matcha, cantidades: 107.2 });
    await agregarLinea(db, mix, { insumoId: agua, cantidades: 892.8 });
    const p = await crearProducto(db, { nombre: 'Matcha Latte', precios: { Único: 70 } });
    await agregarLinea(db, p, { subrecetaId: mix, cantidades: { Único: 36 } });
    const r = await db.query<{ costo_unitario: string }>('select costo_unitario from v_costo_subreceta where subreceta_id = $1', [mix]);
    expect(num(r.rows[0].costo_unitario)).toBeCloseTo(0.12864, 10);
    expect((await costo(p, 'Único')).costo).toBeCloseTo(4.63104, 10);
  });

  it('resuelve sub-recetas anidadas', async () => {
    const azucar = await crearInsumo(db, { nombre: 'AZUCAR', costoPaquete: 50, presentacion: 1000 });
    const cafe2 = await crearInsumo(db, { nombre: 'CAFE 2', costoPaquete: 400, presentacion: 1000 });
    const jarabe = await crearSubreceta(db, { nombre: 'Jarabe', rendimiento: 100 });
    await agregarLinea(db, jarabe, { insumoId: azucar, cantidades: 100 });       // 5 / 100 ml = 0.05
    const mix = await crearSubreceta(db, { nombre: 'Mix Dulce', rendimiento: 200 });
    await agregarLinea(db, mix, { subrecetaId: jarabe, cantidades: 50 });        // 2.5
    await agregarLinea(db, mix, { insumoId: cafe2, cantidades: 10 });            // 4   → 6.5 / 200 = 0.0325
    const p = await crearProducto(db, { nombre: 'Dulce', precios: { Único: 60 } });
    await agregarLinea(db, p, { subrecetaId: mix, cantidades: { Único: 100 } });
    expect((await costo(p, 'Único')).costo).toBeCloseTo(3.25, 10);
  });

  it('un producto sin líneas o un tamaño sin cantidades aparece con costo 0', async () => {
    const vacio = await crearProducto(db, { nombre: 'Vacío', precios: { Único: 30 } });
    expect(await costo(vacio, 'Único')).toEqual({ costo: 0, usaInactivo: false });
    const cafe3 = await crearInsumo(db, { nombre: 'CAFE 3', costoPaquete: 400, presentacion: 1000 });
    const solochica = await crearProducto(db, { nombre: 'Solo chica', precios: { Chica: 30, Grande: 40 } });
    await agregarLinea(db, solochica, { insumoId: cafe3, cantidades: { Chica: 10 } });
    expect((await costo(solochica, 'Grande')).costo).toBe(0);
  });

  it('se recalcula al cambiar el costo de un insumo y marca insumos inactivos, también dentro de sub-recetas', async () => {
    const leche = await crearInsumo(db, { nombre: 'LECHE', costoPaquete: 20, presentacion: 1000, unidad: 'ml' });
    const base = await crearSubreceta(db, { nombre: 'Base Leche', rendimiento: 100 });
    await agregarLinea(db, base, { insumoId: leche, cantidades: 100 });
    const p = await crearProducto(db, { nombre: 'Con Base', precios: { Único: 40 } });
    await agregarLinea(db, p, { subrecetaId: base, cantidades: { Único: 200 } });
    expect((await costo(p, 'Único')).costo).toBeCloseTo(4, 10);
    await db.query('update insumos set costo_paquete = 30 where id = $1', [leche]);
    expect((await costo(p, 'Único')).costo).toBeCloseTo(6, 10);
    await db.query('update insumos set activo = false where id = $1', [leche]);
    expect((await costo(p, 'Único')).usaInactivo).toBe(true);
  });
});
