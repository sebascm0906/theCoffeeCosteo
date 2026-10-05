import type { Area } from './permisos';
export type TablaEditable =
  | 'insumos'
  | 'proveedores'
  | 'categorias_insumo'
  | 'categorias_producto'
  | 'tamanos'
  | 'parametros'
  | 'canales';
export interface Campo {
  nombre: string;
  etiqueta: string;
  tipo: 'texto' | 'numero' | 'porcentaje' | 'booleano' | 'selector';
  nullable?: boolean;
  opciones?: { id: string; nombre: string }[];
}
export const areas: Record<TablaEditable, Area> = {
  insumos: 'insumos',
  proveedores: 'insumos',
  categorias_insumo: 'insumos',
  categorias_producto: 'recetas',
  tamanos: 'configuracion',
  parametros: 'configuracion',
  canales: 'configuracion',
};
export const campos: Record<TablaEditable, Campo[]> = {
  insumos: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { nombre: 'proveedor_id', etiqueta: 'Proveedor', tipo: 'selector' },
    { nombre: 'categoria_id', etiqueta: 'Categoría', tipo: 'selector' },
    { nombre: 'costo_paquete', etiqueta: 'Costo del paquete', tipo: 'numero' },
    { nombre: 'presentacion', etiqueta: 'Presentación', tipo: 'numero' },
    {
      nombre: 'unidad',
      etiqueta: 'Unidad',
      tipo: 'selector',
      opciones: ['gr', 'ml', 'pza'].map((id) => ({ id, nombre: id })),
    },
    { nombre: 'activo', etiqueta: 'Activo', tipo: 'booleano' },
  ],
  proveedores: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { nombre: 'activo', etiqueta: 'Activo', tipo: 'booleano' },
  ],
  categorias_insumo: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { nombre: 'activo', etiqueta: 'Activo', tipo: 'booleano' },
  ],
  categorias_producto: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    { nombre: 'activo', etiqueta: 'Activo', tipo: 'booleano' },
  ],
  tamanos: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero' },
  ],
  parametros: [
    { nombre: 'iva', etiqueta: 'IVA (%)', tipo: 'porcentaje' },
    { nombre: 'margen_objetivo', etiqueta: 'Margen objetivo (%)', tipo: 'porcentaje' },
  ],
  canales: [
    { nombre: 'comision_pct', etiqueta: 'Comisión (%)', tipo: 'porcentaje' },
    { nombre: 'comision_confirmada', etiqueta: 'Comisión confirmada', tipo: 'booleano' },
    { nombre: 'costo_envase', etiqueta: 'Costo de envase', tipo: 'numero' },
    { nombre: 'markup_max_pct', etiqueta: 'Tope de markup (%)', tipo: 'porcentaje', nullable: true },
  ],
};
export function validarRegistro(tabla: TablaEditable, d: Record<string, unknown>) {
  const salida: Record<string, string | number | boolean | null> = {};
  for (const c of campos[tabla]) {
    const v = d[c.nombre];
    if (c.nullable && v === null) {
      salida[c.nombre] = null;
      continue;
    }
    if (c.tipo === 'booleano') {
      if (typeof v !== 'boolean') throw new Error(`${c.etiqueta}: valor inválido`);
      salida[c.nombre] = v;
    } else if (c.tipo === 'numero' || c.tipo === 'porcentaje') {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${c.etiqueta}: indica un número`);
      salida[c.nombre] = v;
    } else {
      if (typeof v !== 'string' || !v.trim()) throw new Error(`Completa ${c.etiqueta}`);
      salida[c.nombre] = v.trim();
    }
  }
  for (const k of ['iva', 'margen_objetivo', 'comision_pct'])
    if (k in salida && (Number(salida[k]) < 0 || Number(salida[k]) >= 1))
      throw new Error('El porcentaje debe estar entre 0 y menos de 100.');
  for (const k of ['costo_paquete', 'costo_envase', 'markup_max_pct'])
    if (salida[k] !== undefined && salida[k] !== null && Number(salida[k]) < 0)
      throw new Error('Los costos y el tope no pueden ser negativos.');
  if (
    tabla === 'insumos' &&
    (Number(salida.presentacion) <= 0 || !['gr', 'ml', 'pza'].includes(String(salida.unidad)))
  )
    throw new Error('Indica presentación positiva y unidad válida.');
  if (
    'orden' in salida &&
    (!Number.isInteger(salida.orden) || Number(salida.orden) < -32768 || Number(salida.orden) > 32767)
  )
    throw new Error('El orden debe ser un entero entre -32768 y 32767.');
  return salida;
}
