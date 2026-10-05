import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import type { CambioExcel, InsumoExcel, LibroExcel, LineaExcel, ParametrosExcel, ProductoExcel } from './tipos';

type Fila = Record<string, unknown> & { __rowNum__: number };

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
}

export function numero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

function hoja(libro: XLSX.WorkBook, nombre: string): XLSX.WorkSheet {
  const ws = libro.Sheets[nombre];
  if (!ws) throw new Error(`El Excel no tiene la hoja "${nombre}"`);
  return ws;
}

/** Filas desde `desdeFila` (1 = primera fila), con columnas por letra y valores en caché (no fórmulas). */
function filas(ws: XLSX.WorkSheet, desdeFila: number): Fila[] {
  return XLSX.utils.sheet_to_json<Fila>(ws, { header: 'A', range: desdeFila - 1, defval: null, raw: true, blankrows: false });
}

const numeroDeFila = (f: Fila) => f.__rowNum__ + 1;

const ETIQUETAS: Record<keyof ParametrosExcel, string> = {
  iva: 'IVA',
  comisionRappi: 'Comisión Rappi',
  envaseRappi: 'Envase de envío Rappi',
  markupMaxRappi: 'Markup máximo Rappi vs POS',
  margenObjetivo: 'Margen bruto objetivo',
};

function leerParametros(ws: XLSX.WorkSheet): ParametrosExcel {
  const porEtiqueta = new Map<string, number>();
  for (const f of filas(ws, 1)) {
    const etiqueta = texto(f.B);
    if (etiqueta) porEtiqueta.set(etiqueta, numero(f.C));
  }
  const resultado = {} as ParametrosExcel;
  for (const [clave, etiqueta] of Object.entries(ETIQUETAS) as [keyof ParametrosExcel, string][]) {
    const valor = porEtiqueta.get(etiqueta);
    if (valor === undefined) throw new Error(`Falta el parámetro "${etiqueta}" en la hoja Parametros`);
    resultado[clave] = valor;
  }
  return resultado;
}

function leerInsumos(ws: XLSX.WorkSheet): InsumoExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.A))
    .map((f) => ({
      fila: numeroDeFila(f),
      nombre: texto(f.A)!,
      proveedor: texto(f.B),
      categoria: texto(f.C),
      costoPaquete: numero(f.D),
      presentacion: numero(f.E),
      unidad: texto(f.F),
    }));
}

function leerRecetario(ws: XLSX.WorkSheet): LineaExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.B) && texto(f.D))
    .map((f) => ({
      fila: numeroDeFila(f),
      producto: texto(f.B)!,
      clasificacion: texto(f.C),
      insumo: texto(f.D)!,
      cantChica: numero(f.E),
      cantGrande: numero(f.F),
    }));
}

function leerResumen(ws: XLSX.WorkSheet): ProductoExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.B))
    .map((f) => ({
      fila: numeroDeFila(f),
      categoria: texto(f.A) ?? '',
      nombre: texto(f.B)!,
      costoChica: numero(f.C),
      costoGrande: numero(f.D),
      precioChica: numero(f.E),
      precioGrande: numero(f.F),
      precioRappi: numero(f.Q),
      margenRappi: numero(f.S),
      alerta: texto(f.U) ?? '',
    }));
}

const letrasOrdenadas = (f: Fila) =>
  Object.keys(f)
    .filter((k) => k !== '__rowNum__')
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

function leerAuditoria(ws: XLSX.WorkSheet): CambioExcel[] {
  const resultado: CambioExcel[] = [];
  let seccion: string | null = null;
  let saltarEncabezado = false;
  for (const f of filas(ws, 4)) {
    const a = texto(f.A);
    if (a && /^\d+\s*·/.test(a)) {
      seccion = a;
      saltarEncabezado = true;
      continue;
    }
    if (!seccion) continue;
    const celdas = letrasOrdenadas(f).map((k) => texto(f[k])).filter((c): c is string => c !== null);
    if (celdas.length === 0) continue;
    if (saltarEncabezado) {
      saltarEncabezado = false;
      continue;
    }
    resultado.push({ hoja: 'Auditoria', seccion, campo: celdas.join(' | '), anterior: null, nuevo: null, nota: seccion });
  }
  return resultado;
}

function leerCorrecciones(ws: XLSX.WorkSheet): CambioExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.A))
    .map((f) => ({
      hoja: 'Correcciones' as const,
      seccion: 'Correcciones',
      campo: [f.A, f.B, f.C].map(texto).filter(Boolean).join(' · '),
      anterior: texto(f.D),
      nuevo: texto(f.E),
      nota: [texto(f.G), texto(f.H)].filter(Boolean).join(' — ') || null,
    }));
}

export function leerLibro(ruta: string): LibroExcel {
  const libro = XLSX.read(readFileSync(ruta), { cellFormula: false });
  return {
    parametros: leerParametros(hoja(libro, 'Parametros')),
    insumos: leerInsumos(hoja(libro, 'Insumos')),
    lineas: leerRecetario(hoja(libro, 'Recetario')),
    productos: leerResumen(hoja(libro, 'Resumen')),
    cambios: [...leerAuditoria(hoja(libro, 'Auditoria')), ...leerCorrecciones(hoja(libro, 'Correcciones'))],
  };
}
