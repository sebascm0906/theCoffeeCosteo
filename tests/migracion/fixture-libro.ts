import * as XLSX from 'xlsx';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DatosFixture {
  insumos?: unknown[][];
  recetario?: unknown[][];
  resumen?: unknown[][];
  auditoria?: unknown[][];
  correcciones?: unknown[][];
}

/** Hoja con título en la fila 1, encabezado en la fila 4 y datos desde la fila 5 (como el Excel real). */
function hojaConDatos(titulo: string, datos: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([[titulo], [], [], ['encabezado'], ...datos]);
}

export function filaResumen(o: {
  categoria: string; nombre: string; costoChica: number; costoGrande?: number; precioChica?: number;
  precioGrande?: number; precioRappi?: number; margenRappi?: number; alerta?: string;
}): unknown[] {
  const fila: unknown[] = new Array(21).fill(null);
  fila[0] = o.categoria; fila[1] = o.nombre; fila[2] = o.costoChica; fila[3] = o.costoGrande ?? 0;
  fila[4] = o.precioChica ?? 0; fila[5] = o.precioGrande ?? 0;
  fila[16] = o.precioRappi ?? 0; fila[18] = o.margenRappi ?? 0; fila[20] = o.alerta ?? '';
  return fila;
}

export function escribirLibroFixture(d: DatosFixture = {}): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['PARÁMETROS DEL MODELO'], [], [], ['1 · REGLAS'], [null, 'Parámetro', 'Valor'],
    [1, 'IVA', 0.16], [2, 'Comisión Rappi', 0.18], [3, 'Envase de envío Rappi', 6.14],
    [4, 'Markup máximo Rappi vs POS', 0.25], [5, 'Margen bruto objetivo', 0.55],
  ]), 'Parametros');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('RESUMEN', d.resumen ?? []), 'Resumen');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('INSUMOS', d.insumos ?? []), 'Insumos');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('RECETARIO', d.recetario ?? []), 'Recetario');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['AUDITORÍA'], [], [], ...(d.auditoria ?? [])]), 'Auditoria');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('CORRECCIONES', d.correcciones ?? []), 'Correcciones');
  const ruta = join(mkdtempSync(join(tmpdir(), 'costeo-')), 'libro.xlsx');
  writeFileSync(ruta, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return ruta;
}
