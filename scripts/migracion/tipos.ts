export type Tamano = 'Único' | 'Chica' | 'Grande';
export interface ParametrosExcel { iva: number; comisionRappi: number; envaseRappi: number; markupMaxRappi: number; margenObjetivo: number }
export interface InsumoExcel { fila: number; nombre: string; proveedor: string | null; categoria: string | null; costoPaquete: number; presentacion: number; unidad: string | null }
export interface LineaExcel { fila: number; producto: string; clasificacion: string | null; insumo: string; cantChica: number; cantGrande: number }
export interface ProductoExcel { fila: number; categoria: string; nombre: string; costoChica: number; costoGrande: number; precioChica: number; precioGrande: number; precioRappi: number; margenRappi: number; alerta: string }
export interface CambioExcel { hoja: 'Auditoria' | 'Correcciones'; seccion: string; campo: string; anterior: string | null; nuevo: string | null; nota: string | null }
export interface LibroExcel { parametros: ParametrosExcel; insumos: InsumoExcel[]; lineas: LineaExcel[]; productos: ProductoExcel[]; cambios: CambioExcel[] }
