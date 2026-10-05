import { randomUUID } from 'node:crypto';
import {
  type Aviso, type Unidad, cantidadesPorTamano, clave, limpiarInsumos, mapearCategoriaProducto, tamanosDeProducto,
} from './limpiar';
import { type LineaLimpia, type ResultadoSubrecetas, detectarSubrecetas } from './subrecetas';
import type { LibroExcel, LineaExcel, Tamano } from './tipos';

export interface PlanCarga {
  parametros: { iva: number; margenObjetivo: number };
  rappi: { comision: number; envase: number; markupMax: number };
  proveedores: { id: string; nombre: string }[];
  categoriasInsumo: { id: string; nombre: string }[];
  categoriasProducto: { id: string; nombre: string; orden: number }[];
  insumos: { id: string; nombre: string; proveedorId: string; categoriaId: string; costoPaquete: number; presentacion: number; unidad: Unidad }[];
  recetas: { id: string; nombre: string; tipo: 'producto' | 'subreceta'; categoriaId: string | null; rendimiento: number | null; unidadRendimiento: Unidad | null }[];
  productoTamanos: { productoId: string; tamano: Tamano; precioLista: number | null }[];
  lineas: { id: string; recetaId: string; insumoId: string | null; subrecetaId: string | null; orden: number }[];
  cantidades: { lineaId: string; tamano: Tamano | null; cantidad: number }[];
  historial: { tabla: string; campo: string; anterior: string | null; nuevo: string | null; nota: string | null }[];
  equivalencias: { original: string; final: string; productos: number }[];
  subrecetas: ResultadoSubrecetas;
  avisos: Aviso[];
}

function catalogo(nombres: string[]): { id: string; nombre: string }[] {
  return [...new Set(nombres)].sort((a, b) => a.localeCompare(b, 'es')).map((nombre) => ({ id: randomUUID(), nombre }));
}

export function construirPlanCarga(libro: LibroExcel): PlanCarga {
  const avisos: Aviso[] = [];
  const insumosLimpios = limpiarInsumos(libro.insumos, avisos);

  const proveedores = catalogo(insumosLimpios.map((i) => i.proveedor));
  const categoriasInsumo = catalogo(insumosLimpios.map((i) => i.categoria));
  const idProveedor = new Map(proveedores.map((p) => [p.nombre, p.id]));
  const idCategoriaInsumo = new Map(categoriasInsumo.map((c) => [c.nombre, c.id]));
  const insumos = insumosLimpios.map((i) => ({
    id: randomUUID(), nombre: i.nombre, proveedorId: idProveedor.get(i.proveedor)!, categoriaId: idCategoriaInsumo.get(i.categoria)!,
    costoPaquete: i.costoPaquete, presentacion: i.presentacion, unidad: i.unidad,
  }));
  const insumoPorClave = new Map(insumos.map((i) => [clave(i.nombre), i]));
  const costoUnitario = new Map(insumos.map((i) => [i.nombre, i.costoPaquete / i.presentacion]));

  // Categorías de producto con equivalencias
  const conteo = new Map<string, { final: string; productos: number }>();
  for (const p of libro.productos) {
    const e = conteo.get(p.categoria) ?? { final: mapearCategoriaProducto(p.categoria), productos: 0 };
    e.productos += 1;
    conteo.set(p.categoria, e);
  }
  const equivalencias = [...conteo.entries()]
    .map(([original, e]) => ({ original, final: e.final, productos: e.productos }))
    .sort((a, b) => a.final.localeCompare(b.final, 'es') || a.original.localeCompare(b.original, 'es'));
  const categoriasProducto = catalogo(equivalencias.map((e) => e.final)).map((c, i) => ({ ...c, orden: i + 1 }));
  const idCategoriaProducto = new Map(categoriasProducto.map((c) => [c.nombre, c.id]));

  // Líneas del Excel por producto, con insumo resuelto
  const lineasPorProducto = new Map<string, LineaExcel[]>();
  const nombresProducto = new Set(libro.productos.map((p) => p.nombre));
  for (const l of libro.lineas) {
    if (!nombresProducto.has(l.producto)) {
      avisos.push({ tipo: 'Producto sin fila en Resumen', detalle: `${l.producto} (fila ${l.fila} del Recetario): línea omitida` });
      continue;
    }
    const lista = lineasPorProducto.get(l.producto) ?? [];
    lista.push(l);
    lineasPorProducto.set(l.producto, lista);
  }

  const tamanosPorProducto = new Map<string, Tamano[]>();
  const lineasLimpias: LineaLimpia[] = [];
  for (const p of libro.productos) {
    const ls = lineasPorProducto.get(p.nombre) ?? [];
    const tamanos = tamanosDeProducto(ls);
    tamanosPorProducto.set(p.nombre, tamanos);
    for (const l of ls) {
      const insumo = insumoPorClave.get(clave(l.insumo));
      if (!insumo) {
        avisos.push({ tipo: 'Insumo no encontrado', detalle: `${l.producto} → "${l.insumo}" (fila ${l.fila} del Recetario): línea omitida` });
        continue;
      }
      const cantidades = cantidadesPorTamano(l, tamanos);
      if (Object.keys(cantidades).length === 0) {
        avisos.push({ tipo: 'Línea sin cantidad', detalle: `${l.producto} → ${insumo.nombre} (fila ${l.fila} del Recetario): línea omitida` });
        continue;
      }
      lineasLimpias.push({ fila: l.fila, producto: l.producto, insumo: insumo.nombre, clasificacion: l.clasificacion, cantidades });
    }
  }

  const subrecetas = detectarSubrecetas(lineasLimpias, costoUnitario);

  const recetas: PlanCarga['recetas'] = [];
  const productoTamanos: PlanCarga['productoTamanos'] = [];
  const lineas: PlanCarga['lineas'] = [];
  const cantidades: PlanCarga['cantidades'] = [];
  const insumoPorNombre = new Map(insumos.map((i) => [i.nombre, i]));

  const idSubreceta = new Map<string, string>();
  for (const s of subrecetas.subrecetas) {
    const id = randomUUID();
    idSubreceta.set(s.nombre, id);
    recetas.push({ id, nombre: s.nombre, tipo: 'subreceta', categoriaId: null, rendimiento: s.rendimiento, unidadRendimiento: 'ml' });
    s.componentes.forEach((c, orden) => {
      const lineaId = randomUUID();
      lineas.push({ id: lineaId, recetaId: id, insumoId: insumoPorNombre.get(c.insumo)!.id, subrecetaId: null, orden });
      cantidades.push({ lineaId, tamano: null, cantidad: c.cantidad });
    });
  }

  const usoPorFila = new Map<number, (typeof subrecetas.usos)[number]>();
  for (const u of subrecetas.usos) for (const f of u.filas) usoPorFila.set(f, u);

  for (const p of libro.productos) {
    const id = randomUUID();
    recetas.push({
      id, nombre: p.nombre, tipo: 'producto', categoriaId: idCategoriaProducto.get(mapearCategoriaProducto(p.categoria))!,
      rendimiento: null, unidadRendimiento: null,
    });
    for (const t of tamanosPorProducto.get(p.nombre)!) {
      const precio = t === 'Grande' ? p.precioGrande : p.precioChica;
      productoTamanos.push({ productoId: id, tamano: t, precioLista: precio > 0 ? precio : null });
    }
    let orden = 0;
    const usosEmitidos = new Set<string>();
    for (const l of lineasLimpias.filter((x) => x.producto === p.nombre)) {
      const uso = usoPorFila.get(l.fila);
      if (uso) {
        if (usosEmitidos.has(uso.subreceta)) continue;
        usosEmitidos.add(uso.subreceta);
        const lineaId = randomUUID();
        lineas.push({ id: lineaId, recetaId: id, insumoId: null, subrecetaId: idSubreceta.get(uso.subreceta)!, orden: orden++ });
        for (const [t, q] of Object.entries(uso.cantidades) as [Tamano, number][]) cantidades.push({ lineaId, tamano: t, cantidad: q });
        continue;
      }
      const lineaId = randomUUID();
      lineas.push({ id: lineaId, recetaId: id, insumoId: insumoPorNombre.get(l.insumo)!.id, subrecetaId: null, orden: orden++ });
      for (const [t, q] of Object.entries(l.cantidades) as [Tamano, number][]) cantidades.push({ lineaId, tamano: t, cantidad: q });
    }
  }

  return {
    parametros: { iva: libro.parametros.iva, margenObjetivo: libro.parametros.margenObjetivo },
    rappi: { comision: libro.parametros.comisionRappi, envase: libro.parametros.envaseRappi, markupMax: libro.parametros.markupMaxRappi },
    proveedores, categoriasInsumo, categoriasProducto, insumos, recetas, productoTamanos, lineas, cantidades,
    historial: libro.cambios.map((c) => ({
      tabla: c.hoja === 'Auditoria' ? 'excel_auditoria' : 'excel_correcciones',
      campo: c.campo, anterior: c.anterior, nuevo: c.nuevo, nota: c.nota,
    })),
    equivalencias, subrecetas, avisos,
  };
}
