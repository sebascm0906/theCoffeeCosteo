import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
let n = 0;

/** Producto de un solo tamaño cuyo costo es exactamente `costo` (insumo de costo unitario 1). */
async function productoCon(precio: number | null, costo: number): Promise<string> {
  n += 1;
  const insumo = await crearInsumo(db, { nombre: `INSUMO ${n}`, costoPaquete: 1, presentacion: 1, unidad: 'pza' });
  const p = await crearProducto(db, { nombre: `Producto ${n}`, precios: { Único: precio } });
  await agregarLinea(db, p, { insumoId: insumo, cantidades: { Único: costo } });
  return p;
}
const fila = async (p: string, canal: string) =>
  (await db.query<Record<string, string | null>>('select * from v_resumen where producto_id = $1 and canal = $2', [p, canal])).rows[0];
const alerta = async (p: string, canal: string) =>
  (await db.query<{ alerta: string | null }>('select alerta from v_alerta_producto_canal where producto_id = $1 and canal = $2', [p, canal])).rows[0].alerta;

beforeAll(async () => { db = await crearDbLocal(); });

describe('v_resumen (mismas fórmulas que el Excel)', () => {
  it('mostrador: venta neta sin IVA, food cost y margen', async () => {
    const p = await productoCon(65, 20);
    const f = await fila(p, 'Mostrador');
    expect(num(f.precio_canal)).toBe(65);
    expect(num(f.venta_neta)).toBeCloseTo(56.034483, 5);
    expect(num(f.food_cost)).toBeCloseTo(0.356923, 5);
    expect(num(f.margen)).toBeCloseTo(36.034483, 5);
    expect(num(f.margen_pct)).toBeCloseTo(0.643077, 5);
    expect(num(f.markup)).toBe(0);
  });

  it('Rappi: precio castigado con tope 25%, comisión sobre venta neta y envase', async () => {
    const p = await productoCon(65, 20);
    const f = await fila(p, 'Rappi');
    // neutro = ROUND(65/0.82 + 6.14·1.16/0.82) = 88; tope = ROUNDDOWN(81.25) = 81
    expect(num(f.precio_canal)).toBe(81);
    expect(num(f.markup)).toBeCloseTo(0.246154, 5);
    expect(num(f.margen)).toBeCloseTo(31.118621, 5);
    expect(num(f.margen_pct)).toBeCloseTo(0.44565, 5);
  });

  it('App propia: precio de mostrador, envase como costo y comisión configurable', async () => {
    const p = await productoCon(65, 20);
    expect(num((await fila(p, 'App propia')).margen)).toBeCloseTo(29.894483, 5);
    await db.query(`update canales set comision_pct = 0.035 where nombre = 'App propia'`);
    expect(num((await fila(p, 'App propia')).margen)).toBeCloseTo(29.894483 - 56.034483 * 0.035, 5);
    await db.query(`update canales set comision_pct = 0 where nombre = 'App propia'`);
  });

  it('cambiar el IVA recalcula todo al instante', async () => {
    const p = await productoCon(65, 20);
    await db.query('update parametros set iva = 0.08');
    expect(num((await fila(p, 'Mostrador')).venta_neta)).toBeCloseTo(65 / 1.08, 5);
    await db.query('update parametros set iva = 0.16');
    expect(num((await fila(p, 'Mostrador')).venta_neta)).toBeCloseTo(65 / 1.16, 5);
  });

  it('sin precio de lista los cálculos quedan en null', async () => {
    const p = await productoCon(null, 20);
    const f = await fila(p, 'Rappi');
    expect([f.precio_canal, f.venta_neta, f.margen, f.margen_pct, f.markup]).toEqual([null, null, null, null, null]);
  });
});

describe('v_alerta_producto_canal', () => {
  it('sin alerta cuando todo está sano', async () => {
    const p = await productoCon(65, 20);
    expect(await alerta(p, 'Mostrador')).toBeNull();
    expect(await alerta(p, 'Rappi')).toBeNull();
  });
  it('Falta precio de lista', async () => {
    expect(await alerta(await productoCon(null, 20), 'Rappi')).toBe('Falta precio de lista');
  });
  it('Vende por debajo del costo', async () => {
    expect(await alerta(await productoCon(65, 60), 'Mostrador')).toBe('Vende por debajo del costo');
  });
  it('Pierde dinero en el canal solo en los canales donde pierde', async () => {
    const p = await productoCon(65, 52);
    expect(await alerta(p, 'Rappi')).toBe('Pierde dinero en el canal');
    expect(await alerta(p, 'App propia')).toBe('Pierde dinero en el canal');
    expect(await alerta(p, 'Mostrador')).toBe('Margen bajo el objetivo');
  });
  it('Margen bajo el objetivo', async () => {
    expect(await alerta(await productoCon(65, 30), 'Mostrador')).toBe('Margen bajo el objetivo');
  });
  it('Usa insumo inactivo', async () => {
    const p = await productoCon(65, 20);
    await db.query(`update insumos set activo = false where nombre = $1`, [`INSUMO ${n}`]);
    expect(await alerta(p, 'Mostrador')).toBe('Usa insumo inactivo');
  });
});
