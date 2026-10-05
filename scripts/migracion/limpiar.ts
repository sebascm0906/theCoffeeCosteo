import { EQUIVALENCIAS_CATEGORIA } from './equivalencias';
import type { InsumoExcel, LineaExcel, Tamano } from './tipos';

export const POR_ASIGNAR = 'POR ASIGNAR';
export interface Aviso { tipo: string; detalle: string }
export type Unidad = 'gr' | 'ml' | 'pza';
export interface InsumoLimpio { nombre: string; proveedor: string; categoria: string; costoPaquete: number; presentacion: number; unidad: Unidad }

export function clave(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizarUnidad(u: string | null): Unidad {
  const k = (u ?? '').trim().toLowerCase();
  if (k === 'gr' || k === 'g') return 'gr';
  if (k === 'ml') return 'ml';
  if (k === 'pcs' || k === 'pza' || k === 'pz' || k === 'pieza') return 'pza';
  throw new Error(`Unidad desconocida: "${u}"`);
}

export function limpiarInsumos(insumos: InsumoExcel[], avisos: Aviso[]): InsumoLimpio[] {
  const vistos = new Set<string>();
  return insumos.map((i) => {
    const k = clave(i.nombre);
    if (vistos.has(k)) throw new Error(`Insumo repetido en el catálogo: "${i.nombre}" (fila ${i.fila})`);
    vistos.add(k);
    let { costoPaquete, presentacion } = i;
    if (presentacion <= 0) {
      avisos.push({
        tipo: 'Presentación ajustada',
        detalle: `${i.nombre} (fila ${i.fila}): presentación ${presentacion} y costo ${costoPaquete}. Queda con presentación 1 y costo 0, igual que calculaba el Excel.`,
      });
      costoPaquete = 0;
      presentacion = 1;
    }
    if (!i.proveedor) avisos.push({ tipo: 'Proveedor por asignar', detalle: `${i.nombre} (fila ${i.fila})` });
    if (!i.categoria) avisos.push({ tipo: 'Categoría de insumo por asignar', detalle: `${i.nombre} (fila ${i.fila})` });
    return {
      nombre: i.nombre,
      proveedor: i.proveedor ?? POR_ASIGNAR,
      categoria: i.categoria ?? POR_ASIGNAR,
      costoPaquete,
      presentacion,
      unidad: normalizarUnidad(i.unidad),
    };
  });
}

export function mapearCategoriaProducto(original: string): string {
  return EQUIVALENCIAS_CATEGORIA[original] ?? original;
}

export function tamanosDeProducto(lineas: LineaExcel[]): Tamano[] {
  return lineas.some((l) => l.cantGrande > 0) ? ['Chica', 'Grande'] : ['Único'];
}

export function cantidadesPorTamano(linea: LineaExcel, tamanos: Tamano[]): Partial<Record<Tamano, number>> {
  if (tamanos.includes('Único')) return linea.cantChica > 0 ? { Único: linea.cantChica } : {};
  const r: Partial<Record<Tamano, number>> = {};
  if (linea.cantChica > 0) r.Chica = linea.cantChica;
  if (linea.cantGrande > 0) r.Grande = linea.cantGrande;
  return r;
}
