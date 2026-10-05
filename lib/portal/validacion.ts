import type { Unidad } from '../supabase/database.types';
export interface Borrador {
  id?: string;
  version?: number;
  nombre: string;
  tipo: 'producto' | 'subreceta';
  categoria_id: string | null;
  rendimiento: number | null;
  unidad_rendimiento: Unidad | null;
  activo: boolean;
  tamanos: string[];
  lineas: {
    id?: string;
    insumo_id: string | null;
    subreceta_id: string | null;
    orden: number;
    cantidades: { tamano_id: string | null; cantidad: number }[];
  }[];
}
export function validarReceta(d: Borrador) {
  if (!d || typeof d.nombre !== 'string' || !d.nombre.trim()) throw new Error('Escribe el nombre.');
  if (!['producto', 'subreceta'].includes(d.tipo)) throw new Error('Tipo de receta inválido.');
  if (d.tipo === 'producto' && (!d.categoria_id || !d.tamanos?.length))
    throw new Error('Selecciona categoría y al menos un tamaño.');
  if (
    d.tipo === 'subreceta' &&
    (!Number.isFinite(d.rendimiento) ||
      Number(d.rendimiento) <= 0 ||
      !['gr', 'ml', 'pza'].includes(d.unidad_rendimiento ?? ''))
  )
    throw new Error('Indica rendimiento positivo y unidad.');
  if (!Array.isArray(d.lineas)) throw new Error('Líneas inválidas.');
  for (const l of d.lineas) {
    if (Boolean(l.insumo_id) === Boolean(l.subreceta_id))
      throw new Error('Selecciona un componente por línea.');
    if (
      !Array.isArray(l.cantidades) ||
      l.cantidades.some((c) => !Number.isFinite(c.cantidad) || c.cantidad < 0)
    )
      throw new Error('Las cantidades deben ser números iguales o mayores a cero.');
    if (
      l.cantidades.some((c) =>
        d.tipo === 'subreceta' ? c.tamano_id !== null : !c.tamano_id || !d.tamanos.includes(c.tamano_id),
      )
    )
      throw new Error('Cantidad en un tamaño inválido.');
  }
  return d;
}
export function numeroCapturado(s: string) {
  if (!s.trim() || !Number.isFinite(Number(s))) throw new Error('Completa todos los campos numéricos.');
  return Number(s);
}
