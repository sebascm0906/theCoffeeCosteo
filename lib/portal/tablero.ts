import type { Resumen } from '../supabase/database.types';
export function indicadores(filas: Resumen[]) {
  const activos = filas.filter((f) => f.activo);
  const mostrador = activos.filter((f) => f.canal === 'Mostrador');
  const conPrecio = mostrador.filter((f) => f.food_cost !== null);
  const contar = (xs: Resumen[]) => new Set(xs.map((f) => f.producto_id)).size;
  return {
    productos: contar(activos),
    foodCost: conPrecio.length ? conPrecio.reduce((n, f) => n + f.food_cost!, 0) / conPrecio.length : null,
    bajoObjetivo: contar(
      mostrador.filter((f) => f.margen_pct !== null && f.margen_pct > 0 && f.margen_pct < f.margen_objetivo),
    ),
    sinPrecio: contar(mostrador.filter((f) => f.precio_lista === null)),
    pierdenDelivery: contar(
      activos.filter((f) => f.canal !== 'Mostrador' && f.margen !== null && f.margen < 0),
    ),
  };
}
