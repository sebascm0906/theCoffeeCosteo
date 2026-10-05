import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { cargarPlan } from '../../scripts/migracion/cargar';
import { construirPlanCarga } from '../../scripts/migracion/plan-carga';
import { libroDePrueba } from './libro-de-prueba';

describe('cargarPlan', () => {
  it('carga todo y los costos de la base cuadran con el Excel', async () => {
    const db = await crearDbLocal();
    const libro = libroDePrueba();
    await cargarPlan(db, construirPlanCarga(libro));
    const r = await db.query<{ producto: string; tamano: string; costo: string }>(
      `select r.nombre as producto, t.nombre as tamano, c.costo
       from v_costo_producto c join recetas r on r.id = c.producto_id join tamanos t on t.id = c.tamano_id`);
    const costo = (p: string, t: string) => Number(r.rows.find((x) => x.producto === p && x.tamano === t)!.costo);
    expect(costo('Matcha Latte', 'Chica')).toBeCloseTo(6.632, 2);
    expect(costo('Matcha Latte', 'Grande')).toBeCloseTo(7.784, 2);
    expect(costo('Matcha Iced', 'Chica')).toBeCloseTo(4.632, 2);
  });

  it('carga los precios Rappi manuales y v_resumen los usa', async () => {
    const db = await crearDbLocal();
    await cargarPlan(db, construirPlanCarga(libroDePrueba()));
    const r = await db.query<{ producto: string; tamano: string; precio_calculado: string; precio_canal: string }>(
      `select producto, tamano, precio_calculado, precio_canal from v_resumen where canal = 'Rappi' and precio_lista is not null order by producto`);
    expect(r.rows.map((x) => [x.producto, x.tamano, Number(x.precio_calculado), Number(x.precio_canal)])).toEqual([
      ['Agua sola', 'Único', 12, 12],
      ['Matcha Latte', 'Chica', 87, 80],
    ]);
  });

  it('no deja bitácora de portal, sí el historial del Excel con origen migracion', async () => {
    const db = await crearDbLocal();
    await cargarPlan(db, construirPlanCarga(libroDePrueba()));
    const r = await db.query<{ origen: string; tabla: string }>('select origen, tabla from bitacora');
    expect(r.rows).toEqual([{ origen: 'migracion', tabla: 'excel_correcciones' }]);
  });

  it('aborta sin duplicar si la base ya tiene datos', async () => {
    const db = await crearDbLocal();
    const plan = construirPlanCarga(libroDePrueba());
    await cargarPlan(db, plan);
    await expect(cargarPlan(db, plan)).rejects.toThrow(/base ya tiene insumos/);
    const r = await db.query<{ n: number }>('select count(*)::int as n from insumos');
    expect(Number(r.rows[0].n)).toBe(3);
  });

  it('si algo falla a la mitad no deja nada cargado', async () => {
    const db = await crearDbLocal();
    const plan = construirPlanCarga(libroDePrueba());
    plan.cantidades.push({ lineaId: plan.lineas[0].id, tamano: 'Único', cantidad: 1 }); // lineas[0] es de la sub-receta: una cantidad con tamaño → error del trigger
    await expect(cargarPlan(db, plan)).rejects.toThrow();
    const r = await db.query<{ n: number }>('select count(*)::int as n from recetas');
    expect(Number(r.rows[0].n)).toBe(0);
  });
});
