import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import type { FilaConciliacion } from './conciliar';
import type { PlanCarga } from './plan-carga';

const r2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

export function escribirReporte(ruta: string, plan: PlanCarga, conciliacion: FilaConciliacion[]): void {
  const wb = XLSX.utils.book_new();
  const fallas = conciliacion.filter((c) => !c.ok);
  const agregar = (nombre: string, filas: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ '(sin filas)': '' }]), nombre);

  agregar('Resumen', [
    { Concepto: 'Insumos', Valor: plan.insumos.length },
    { Concepto: 'Productos', Valor: plan.recetas.filter((r) => r.tipo === 'producto').length },
    { Concepto: 'Sub-recetas propuestas', Valor: plan.subrecetas.subrecetas.length },
    { Concepto: 'Mixes que se quedan como ingredientes', Valor: plan.subrecetas.sinAgrupar.length },
    { Concepto: 'Avisos', Valor: plan.avisos.length },
    { Concepto: 'Productos×tamaño conciliados', Valor: conciliacion.length },
    { Concepto: 'Diferencias de costo > $0.01', Valor: fallas.length },
    { Concepto: 'Resultado', Valor: fallas.length === 0 ? 'CUADRA — se puede aplicar' : 'NO CUADRA — no aplicar' },
  ]);
  agregar('Conciliación', conciliacion.map((c) => ({
    Producto: c.producto, Tamaño: c.tamano, 'Costo Excel': r2(c.costoExcel), 'Costo portal': r2(c.costoPortal),
    Diferencia: r2(c.diferencia), Cuadra: c.ok ? 'Sí' : 'NO',
  })));
  agregar('Equivalencias categorías', plan.equivalencias.map((e) => ({
    'Categoría en Excel': e.original, 'Categoría en portal': e.final, Productos: e.productos, Cambia: e.original === e.final ? '' : 'Sí',
  })));
  agregar('Sub-recetas', plan.subrecetas.subrecetas.flatMap((s) => s.componentes.map((c, i) => ({
    'Sub-receta': i === 0 ? s.nombre : '', 'Rendimiento (ml)': i === 0 ? s.rendimiento : '', Insumo: c.insumo, Cantidad: c.cantidad,
    'Usada en': i === 0 ? s.productos.join(', ') : '',
  }))));
  agregar('Mixes sin agrupar', plan.subrecetas.sinAgrupar.map((s) => ({ Producto: s.producto, Insumos: s.insumos.join(', '), Motivo: s.motivo })));
  agregar('Avisos', plan.avisos.map((a) => ({ Tipo: a.tipo, Detalle: a.detalle })));

  writeFileSync(ruta, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
