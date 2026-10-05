import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

let db: PGlite;
let n = 0;
let rappi: string;
let unico: string;

/** Producto Único con precio de lista 65 y costo 20: Rappi calculado = 81 (tope 25%). */
async function producto(): Promise<string> {
  n += 1;
  const insumo = await crearInsumo(db, { nombre: `INSUMO MANUAL ${n}`, costoPaquete: 1, presentacion: 1, unidad: 'pza' });
  const p = await crearProducto(db, { nombre: `Producto manual ${n}`, precios: { Único: 65 } });
  await agregarLinea(db, p, { insumoId: insumo, cantidades: { Único: 20 } });
  return p;
}
const fijar = (p: string, precio: number) =>
  db.query('insert into precio_canal_manual (producto_id, tamano_id, canal_id, precio) values ($1, $2, $3, $4)', [p, unico, rappi, precio]);
const fila = async (p: string) =>
  (await db.query<Record<string, string | null>>(`select * from v_resumen where producto_id = $1 and canal = 'Rappi'`, [p])).rows[0];
const alerta = async (p: string) =>
  (await db.query<{ alerta: string | null }>(`select alerta from v_alerta_producto_canal where producto_id = $1 and canal = 'Rappi'`, [p])).rows[0].alerta;

beforeAll(async () => {
  db = await crearDbLocal();
  rappi = (await db.query<{ id: string }>(`select id from canales where nombre = 'Rappi'`)).rows[0].id;
  unico = await idTamano(db, 'Único');
});

describe('precio de canal manual', () => {
  it('sustituye al calculado en precio, margen y markup; el calculado sigue visible', async () => {
    const p = await producto();
    await fijar(p, 75);
    const f = await fila(p);
    expect(num(f.precio_calculado)).toBe(81);
    expect(num(f.precio_manual)).toBe(75);
    expect(num(f.precio_canal)).toBe(75);
    expect(num(f.venta_neta)).toBeCloseTo(75 / 1.16, 5);
    expect(num(f.margen)).toBeCloseTo((75 / 1.16) * 0.82 - 20 - 6.14, 5);
    expect(num(f.markup)).toBeCloseTo(75 / 65 - 1, 5);
  });

  it('al borrarlo vuelve el precio calculado', async () => {
    const p = await producto();
    await fijar(p, 75);
    await db.query('delete from precio_canal_manual where producto_id = $1', [p]);
    const f = await fila(p);
    expect(f.precio_manual).toBeNull();
    expect(num(f.precio_canal)).toBe(81);
  });

  it('un precio manual sobre el tope dispara la alerta de markup', async () => {
    const p = await producto();
    expect(await alerta(p)).toBeNull();
    await fijar(p, 90);
    expect(await alerta(p)).toBe('Markup sobre el tope');
  });

  it('solo Finanzas y Admin lo capturan', async () => {
    const p = await producto();
    const operaciones = await crearUsuario(db, 'operaciones');
    await expect(comoUsuario(db, operaciones, () => fijar(p, 75))).rejects.toThrow(/row-level security/);
    const finanzas = await crearUsuario(db, 'finanzas');
    await comoUsuario(db, finanzas, () => fijar(p, 75));
    const admin = await crearUsuario(db, 'admin');
    const r = await comoUsuario(db, admin, () => db.query('update precio_canal_manual set precio = 76 where producto_id = $1 returning precio', [p]));
    expect(r.rows).toHaveLength(1);
    const borrado = await comoUsuario(db, operaciones, () => db.query('delete from precio_canal_manual where producto_id = $1 returning 1', [p]));
    expect(borrado.rows).toHaveLength(0);
  });

  it('nadie con sesión puede vaciarla con truncate (saltaría RLS y bitácora)', async () => {
    const finanzas = await crearUsuario(db, 'finanzas');
    await expect(comoUsuario(db, finanzas, () => db.query('truncate precio_canal_manual'))).rejects.toThrow(/permission denied/);
  });

  it('no se puede cambiar el producto, el tamaño o el canal de un precio manual', async () => {
    const p = await producto();
    const otro = await producto();
    await fijar(p, 75);
    const appPropia = (await db.query<{ id: string }>(`select id from canales where nombre = 'App propia'`)).rows[0].id;
    const mensaje = /No se puede cambiar el producto, el tamaño o el canal de un precio manual/;
    await expect(db.query('update precio_canal_manual set canal_id = $1 where producto_id = $2', [appPropia, p])).rejects.toThrow(mensaje);
    await expect(db.query('update precio_canal_manual set producto_id = $1 where producto_id = $2', [otro, p])).rejects.toThrow(mensaje);
    const finanzas = await crearUsuario(db, 'finanzas');
    await expect(comoUsuario(db, finanzas, () =>
      db.query('update precio_canal_manual set canal_id = $1 where producto_id = $2', [appPropia, p]))).rejects.toThrow(mensaje);
    expect(num((await fila(p)).precio_canal)).toBe(75);
  });

  it('queda en la bitácora ligado al producto', async () => {
    const p = await producto();
    const finanzas = await crearUsuario(db, 'finanzas');
    await comoUsuario(db, finanzas, async () => {
      await fijar(p, 75);
      await db.query('update precio_canal_manual set precio = 74 where producto_id = $1', [p]);
    });
    const r = await db.query<{ registro_id: string; receta_id: string; campo: string; valor_anterior: string | null; valor_nuevo: string | null; usuario_id: string }>(
      `select registro_id, receta_id, campo, valor_anterior, valor_nuevo, usuario_id from bitacora where tabla = 'precio_canal_manual' and receta_id = $1 order by id`, [p]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ registro_id: `${p}:${unico}:${rappi}`, campo: '*', usuario_id: finanzas });
    expect(r.rows[1]).toMatchObject({ campo: 'precio', valor_anterior: '75', valor_nuevo: '74' });
  });
});
