import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { cargarPlan } from '../../scripts/migracion/cargar';
import { conciliar } from '../../scripts/migracion/conciliar';
import { leerLibro } from '../../scripts/migracion/leer-excel';
import { type PlanCarga, construirPlanCarga } from '../../scripts/migracion/plan-carga';
import type { LibroExcel } from '../../scripts/migracion/tipos';

const RUTA = process.env.EXCEL_COSTEO ?? 'datos/Modelo_Costeo_Corregido_2026.xlsx';
const ALERTA_PORTAL: Record<string, string | null> = {
  '': null,
  'Falta precio de lista': 'Falta precio de lista',
  'Vende por debajo del costo': 'Vende por debajo del costo',
  'Markup Rappi sobre el tope': 'Markup sobre el tope',
  'Pierde dinero en Rappi': 'Pierde dinero en el canal',
  'Margen bajo el objetivo': 'Margen bajo el objetivo',
};

let db: PGlite;
let libro: LibroExcel;
let plan: PlanCarga;

beforeAll(async () => {
  if (!existsSync(RUTA)) throw new Error(`Copia el Excel de costeo a ${RUTA} (o define EXCEL_COSTEO)`);
  libro = leerLibro(RUTA);
  plan = construirPlanCarga(libro);
  db = await crearDbLocal();
  await cargarPlan(db, plan);
});

describe('paridad con el Excel real', () => {
  it('migra todos los productos e insumos', async () => {
    const r = await db.query<{ productos: number; insumos: number }>(
      `select (select count(*)::int from recetas where tipo = 'producto') as productos, (select count(*)::int from insumos) as insumos`);
    expect(r.rows[0]).toEqual({ productos: libro.productos.length, insumos: libro.insumos.length });
  });

  it('el costo de cada producto y tamaño cuadra con el Excel (±$0.01)', async () => {
    const filas = await conciliar(db, libro);
    const fallas = filas.filter((f) => !f.ok);
    expect(fallas, JSON.stringify(fallas.slice(0, 10), null, 2)).toEqual([]);
    expect(filas.length).toBeGreaterThanOrEqual(libro.productos.length);
  });

  it('precio y margen Rappi cuadran en el tamaño que usaba el Excel', async () => {
    const r = await db.query<{ producto: string; tamano: string; precio_canal: string; margen: string }>(
      `select producto, tamano, precio_canal, margen from v_resumen where canal = 'Rappi'`);
    const fallas: string[] = [];
    for (const p of libro.productos.filter((x) => x.precioRappi > 0)) {
      const tamanos = r.rows.filter((x) => x.producto === p.nombre).map((x) => x.tamano);
      const tamano = p.precioGrande > 0 ? 'Grande' : tamanos.includes('Único') ? 'Único' : 'Chica';
      const fila = r.rows.find((x) => x.producto === p.nombre && x.tamano === tamano);
      if (!fila || Number(fila.precio_canal) !== p.precioRappi || Math.abs(Number(fila.margen) - p.margenRappi) > 0.01) {
        fallas.push(`${p.nombre} (${tamano}): Excel ${p.precioRappi}/${p.margenRappi.toFixed(2)} vs portal ${fila?.precio_canal}/${Number(fila?.margen).toFixed(2)}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('la alerta de cada producto en el canal Rappi es la del Excel', async () => {
    const r = await db.query<{ producto: string; alerta: string | null }>(
      `select producto, alerta from v_alerta_producto_canal where canal = 'Rappi'`);
    const porProducto = new Map(r.rows.map((x) => [x.producto, x.alerta]));
    const fallas: string[] = [];
    for (const p of libro.productos) {
      const esperado = ALERTA_PORTAL[p.alerta];
      const portal = porProducto.get(p.nombre) ?? null;
      if (portal === esperado) continue;
      // Diferencia intencional (spec §4.3): el portal evalúa Rappi en todos los tamaños; el Excel solo en uno.
      const dosTamanosConPrecio = p.precioChica > 0 && p.precioGrande > 0;
      if (dosTamanosConPrecio && portal === 'Pierde dinero en el canal') continue;
      fallas.push(`${p.nombre}: Excel "${p.alerta}" vs portal "${portal}"`);
    }
    expect(fallas).toEqual([]);
  });

  it('propone al menos una sub-receta reutilizada', () => {
    expect(plan.subrecetas.subrecetas.length).toBeGreaterThan(0);
  });
});
