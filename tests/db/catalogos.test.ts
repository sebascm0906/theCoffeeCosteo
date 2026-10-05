import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearInsumo } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
beforeAll(async () => { db = await crearDbLocal(); });

describe('configuración inicial', () => {
  it('trae IVA 16% y margen objetivo 55%', async () => {
    const r = await db.query<{ iva: string; margen_objetivo: string }>('select iva, margen_objetivo from parametros');
    expect(r.rows).toHaveLength(1);
    expect(num(r.rows[0].iva)).toBe(0.16);
    expect(num(r.rows[0].margen_objetivo)).toBe(0.55);
  });

  it('trae los 3 canales con sus reglas', async () => {
    const r = await db.query<Record<string, unknown>>(
      'select nombre, regla_precio, comision_pct, comision_confirmada, costo_envase, markup_max_pct from canales order by orden',
    );
    expect(r.rows.map((c) => [c.nombre, c.regla_precio, num(c.comision_pct), c.comision_confirmada, num(c.costo_envase), c.markup_max_pct === null ? null : num(c.markup_max_pct)])).toEqual([
      ['Mostrador', 'mostrador', 0, true, 0, null],
      ['Rappi', 'castigado', 0.18, true, 6.14, 0.25],
      ['App propia', 'mostrador', 0, false, 6.14, null],
    ]);
  });

  it('trae los tamaños Único, Chica y Grande', async () => {
    const r = await db.query<{ nombre: string }>('select nombre from tamanos order by orden');
    expect(r.rows.map((t) => t.nombre)).toEqual(['Único', 'Chica', 'Grande']);
  });

  it('solo permite una fila de parámetros', async () => {
    await expect(db.query('insert into parametros (id, iva, margen_objetivo) values (2, 0.16, 0.5)')).rejects.toThrow();
  });
});

describe('insumos', () => {
  it('calcula el costo unitario como costo del paquete entre presentación, sin redondear', async () => {
    const id = await crearInsumo(db, { nombre: 'QUESO GOUDA', costoPaquete: 524.8, presentacion: 3280 });
    const r = await db.query<{ costo_unitario: string }>('select costo_unitario from insumos where id = $1', [id]);
    expect(num(r.rows[0].costo_unitario)).toBeCloseTo(0.16, 10);
  });

  it('rechaza presentación 0, costos negativos, nombres vacíos y nombres repetidos', async () => {
    await expect(crearInsumo(db, { nombre: 'X0', costoPaquete: 10, presentacion: 0 })).rejects.toThrow();
    await expect(crearInsumo(db, { nombre: 'X1', costoPaquete: -1, presentacion: 1 })).rejects.toThrow();
    await expect(crearInsumo(db, { nombre: '  ', costoPaquete: 1, presentacion: 1 })).rejects.toThrow();
    await crearInsumo(db, { nombre: 'LECHE ENTERA', costoPaquete: 25, presentacion: 1000, unidad: 'ml' });
    await expect(crearInsumo(db, { nombre: 'LECHE ENTERA', costoPaquete: 25, presentacion: 1000, unidad: 'ml' })).rejects.toThrow();
  });

  it('rechaza unidades fuera de gr, ml, pza', async () => {
    await expect(
      db.query(`insert into insumos (nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad)
                select 'Y', p.id, c.id, 1, 1, 'pcs' from proveedores p, categorias_insumo c limit 1`),
    ).rejects.toThrow();
  });
});
