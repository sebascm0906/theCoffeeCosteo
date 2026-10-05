import { todas, type Db } from './consultas';
import type { Borrador } from './validacion';
import type { OpcionComponente } from '@/components/recetas/selector-componente';
export async function cargarEditor(db: Db, tipo: 'producto' | 'subreceta', id?: string) {
  const [recetas, insumos, categorias, tamanos, lineas, cantidades, productosTamanos, costos] =
    await Promise.all([
      todas(db, 'recetas', 'id'),
      todas(db, 'insumos', 'id'),
      todas(db, 'categorias_producto', 'orden,id'),
      todas(db, 'tamanos', 'orden,id'),
      todas(db, 'receta_lineas', 'receta_id,orden,id'),
      todas(db, 'linea_cantidades', 'linea_id,tamano_id'),
      todas(db, 'producto_tamanos', 'producto_id,tamano_id'),
      todas(db, 'v_costo_subreceta', 'subreceta_id'),
    ]);
  const receta = id ? recetas.find((r) => r.id === id && r.tipo === tipo) : undefined;
  if (id && !receta) return null;
  const borrador: Borrador = receta
    ? {
        id: receta.id,
        version: receta.version,
        nombre: receta.nombre,
        tipo,
        categoria_id: receta.categoria_id,
        rendimiento: receta.rendimiento,
        unidad_rendimiento: receta.unidad_rendimiento,
        activo: receta.activo,
        tamanos: productosTamanos.filter((p) => p.producto_id === id).map((p) => p.tamano_id),
        lineas: lineas
          .filter((l) => l.receta_id === id)
          .map((l) => ({
            id: l.id,
            insumo_id: l.insumo_id,
            subreceta_id: l.subreceta_id,
            orden: l.orden,
            cantidades: cantidades
              .filter((c) => c.linea_id === l.id)
              .map((c) => ({ tamano_id: c.tamano_id, cantidad: c.cantidad })),
          })),
      }
    : {
        nombre: '',
        tipo,
        categoria_id: null,
        rendimiento: tipo === 'subreceta' ? 1000 : null,
        unidad_rendimiento: tipo === 'subreceta' ? 'ml' : null,
        activo: true,
        tamanos: [],
        lineas: [],
      };
  const opciones: OpcionComponente[] = [
    ...insumos.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      tipo: 'insumo' as const,
      unidad: i.unidad,
      costo: i.costo_unitario,
      activo: i.activo,
    })),
    ...recetas
      .filter((r) => r.tipo === 'subreceta' && r.id !== id)
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        tipo: 'subreceta' as const,
        unidad: r.unidad_rendimiento!,
        costo: costos.find((c) => c.subreceta_id === r.id)?.costo_unitario ?? 0,
        activo: r.activo,
      })),
  ];
  return {
    borrador,
    opciones,
    categorias,
    tamanos,
    lineas,
    recetas,
    costoOficial: costos.find((c) => c.subreceta_id === id)?.costo_unitario ?? 0,
  };
}
