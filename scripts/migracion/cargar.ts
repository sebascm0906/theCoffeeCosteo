import type { Ejecutor } from '../db/ejecutor';
import type { PlanCarga } from './plan-carga';

/** Carga el plan en una sola transacción. Solo corre sobre una base sin insumos. */
export async function cargarPlan(db: Ejecutor, plan: PlanCarga): Promise<void> {
  const existentes = await db.query<{ n: number }>('select count(*)::int as n from insumos');
  if (Number(existentes.rows[0].n) > 0) {
    throw new Error('La base ya tiene insumos: la migración solo corre sobre una base vacía');
  }
  await db.query('begin');
  try {
    await db.query(`select set_config('app.origen', 'migracion', true)`);
    await db.query('update parametros set iva = $1, margen_objetivo = $2 where id = 1', [plan.parametros.iva, plan.parametros.margenObjetivo]);
    await db.query(`update canales set comision_pct = $1, costo_envase = $2, markup_max_pct = $3 where nombre = 'Rappi'`,
      [plan.rappi.comision, plan.rappi.envase, plan.rappi.markupMax]);
    await db.query(`update canales set costo_envase = $1 where nombre = 'App propia'`, [plan.rappi.envase]);

    const tamanos = await db.query<{ id: string; nombre: string }>('select id, nombre from tamanos');
    const idTamano = new Map(tamanos.rows.map((t) => [t.nombre, t.id]));

    for (const p of plan.proveedores) await db.query('insert into proveedores (id, nombre) values ($1, $2)', [p.id, p.nombre]);
    for (const c of plan.categoriasInsumo) await db.query('insert into categorias_insumo (id, nombre) values ($1, $2)', [c.id, c.nombre]);
    for (const c of plan.categoriasProducto) {
      await db.query('insert into categorias_producto (id, nombre, orden) values ($1, $2, $3)', [c.id, c.nombre, c.orden]);
    }
    for (const i of plan.insumos) {
      await db.query(
        `insert into insumos (id, nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [i.id, i.nombre, i.proveedorId, i.categoriaId, i.costoPaquete, i.presentacion, i.unidad]);
    }
    for (const r of plan.recetas) {
      await db.query(
        `insert into recetas (id, nombre, tipo, categoria_id, rendimiento, unidad_rendimiento) values ($1, $2, $3, $4, $5, $6)`,
        [r.id, r.nombre, r.tipo, r.categoriaId, r.rendimiento, r.unidadRendimiento]);
    }
    for (const t of plan.productoTamanos) {
      await db.query('insert into producto_tamanos (producto_id, tamano_id, precio_lista) values ($1, $2, $3)',
        [t.productoId, idTamano.get(t.tamano), t.precioLista]);
    }
    for (const l of plan.lineas) {
      await db.query('insert into receta_lineas (id, receta_id, insumo_id, subreceta_id, orden) values ($1, $2, $3, $4, $5)',
        [l.id, l.recetaId, l.insumoId, l.subrecetaId, l.orden]);
    }
    for (const c of plan.cantidades) {
      await db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, $2, $3)',
        [c.lineaId, c.tamano === null ? null : idTamano.get(c.tamano), c.cantidad]);
    }
    for (const h of plan.historial) {
      await db.query(
        `insert into bitacora (tabla, campo, valor_anterior, valor_nuevo, nota, origen) values ($1, $2, $3, $4, $5, 'migracion')`,
        [h.tabla, h.campo, h.anterior, h.nuevo, h.nota]);
    }
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
