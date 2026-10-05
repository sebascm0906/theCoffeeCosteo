import type { Tamano } from './tipos';

export interface LineaLimpia { fila: number; producto: string; insumo: string; clasificacion: string | null; cantidades: Partial<Record<Tamano, number>> }
export interface SubrecetaPropuesta { nombre: string; rendimiento: number; componentes: { insumo: string; cantidad: number }[]; productos: string[] }
export interface UsoSubreceta { producto: string; subreceta: string; filas: number[]; cantidades: Partial<Record<Tamano, number>> }
export interface MixSinAgrupar { producto: string; insumos: string[]; motivo: string }
export interface ResultadoSubrecetas { subrecetas: SubrecetaPropuesta[]; usos: UsoSubreceta[]; sinAgrupar: MixSinAgrupar[] }

export const RENDIMIENTO_LOTE = 1000;
const TOLERANCIA_PROPORCION = 0.005;
const SIN_NOMBRE = new Set(['AGUA', 'HIELO']);
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

interface MixProducto {
  producto: string;
  insumos: string[];                                       // orden de aparición
  filas: number[];
  porTamano: Map<Tamano, Map<string, number>>;             // tamaño → insumo → cantidad (solo tamaños con total > 0)
}
interface Cluster { insumos: string[]; proporciones: Map<string, number>; miembros: MixProducto[] }

function agruparPorProducto(lineas: LineaLimpia[]): MixProducto[] {
  const porProducto = new Map<string, LineaLimpia[]>();
  for (const l of lineas) {
    if (l.clasificacion !== 'MIX') continue;
    const lista = porProducto.get(l.producto) ?? [];
    lista.push(l);
    porProducto.set(l.producto, lista);
  }
  return [...porProducto.entries()].map(([producto, ls]) => {
    const porTamano = new Map<Tamano, Map<string, number>>();
    for (const l of ls) {
      for (const [t, q] of Object.entries(l.cantidades) as [Tamano, number][]) {
        const m = porTamano.get(t) ?? new Map<string, number>();
        m.set(l.insumo, (m.get(l.insumo) ?? 0) + q);
        porTamano.set(t, m);
      }
    }
    for (const [t, m] of porTamano) if ([...m.values()].reduce((a, b) => a + b, 0) <= 0) porTamano.delete(t);
    return { producto, insumos: ls.map((l) => l.insumo), filas: ls.map((l) => l.fila), porTamano };
  });
}

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

function encaja(mix: MixProducto, cluster: Cluster): boolean {
  for (const m of mix.porTamano.values()) {
    const t = total(m);
    for (const insumo of cluster.insumos) {
      if (Math.abs((m.get(insumo) ?? 0) / t - cluster.proporciones.get(insumo)!) > TOLERANCIA_PROPORCION) return false;
    }
  }
  return true;
}

function nombreBase(insumos: string[]): string {
  const visibles = insumos.filter((i) => !SIN_NOMBRE.has(i.toUpperCase()));
  return 'Mix ' + (visibles.length > 0 ? visibles : insumos).join(' + ');
}

export function detectarSubrecetas(lineas: LineaLimpia[], costoUnitario: Map<string, number>): ResultadoSubrecetas {
  const sinAgrupar: MixSinAgrupar[] = [];
  const clustersPorClave = new Map<string, Cluster[]>();
  const ordenClusters: Cluster[] = [];

  for (const mix of agruparPorProducto(lineas)) {
    const distintos = [...new Set(mix.insumos)];
    if (distintos.length < 2) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Un solo insumo: no es una mezcla' });
      continue;
    }
    if (distintos.length !== mix.insumos.length) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Insumo repetido dentro del mix' });
      continue;
    }
    if (mix.porTamano.size === 0) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Mix sin cantidades' });
      continue;
    }
    const k = [...distintos].sort().join('|');
    const candidatos = clustersPorClave.get(k) ?? [];
    const existente = candidatos.find((c) => encaja(mix, c));
    if (existente) {
      existente.miembros.push(mix);
      continue;
    }
    const primero = [...mix.porTamano.values()][0];
    const t = total(primero);
    const nuevo: Cluster = {
      insumos: distintos,
      proporciones: new Map(distintos.map((i) => [i, (primero.get(i) ?? 0) / t])),
      miembros: [mix],
    };
    if (!encaja(mix, nuevo)) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Proporción distinta entre tamaños' });
      continue;
    }
    candidatos.push(nuevo);
    clustersPorClave.set(k, candidatos);
    ordenClusters.push(nuevo);
  }

  const subrecetas: SubrecetaPropuesta[] = [];
  const usos: UsoSubreceta[] = [];
  const nombresUsados = new Map<string, number>();
  for (const c of ordenClusters) {
    if (c.miembros.length < 2) {
      sinAgrupar.push({ producto: c.miembros[0].producto, insumos: c.insumos, motivo: 'Proporción única: no se reutiliza en otro producto' });
      continue;
    }
    const base = nombreBase(c.insumos);
    const veces = (nombresUsados.get(base) ?? 0) + 1;
    nombresUsados.set(base, veces);
    const nombre = veces === 1 ? base : `${base} (${veces})`;
    const componentes = c.insumos.map((i) => ({ insumo: i, cantidad: round6(c.proporciones.get(i)! * RENDIMIENTO_LOTE) }));
    const costoPorUnidad = componentes.reduce((acc, comp) => acc + comp.cantidad * (costoUnitario.get(comp.insumo) ?? 0), 0) / RENDIMIENTO_LOTE;
    subrecetas.push({ nombre, rendimiento: RENDIMIENTO_LOTE, componentes, productos: c.miembros.map((m) => m.producto) });
    for (const m of c.miembros) {
      const cantidades: Partial<Record<Tamano, number>> = {};
      for (const [t, mapa] of m.porTamano) {
        const costoOriginal = [...mapa].reduce((acc, [insumo, q]) => acc + q * (costoUnitario.get(insumo) ?? 0), 0);
        cantidades[t] = round6(costoPorUnidad > 0 ? costoOriginal / costoPorUnidad : total(mapa));
      }
      usos.push({ producto: m.producto, subreceta: nombre, filas: m.filas, cantidades });
    }
  }
  return { subrecetas, usos, sinAgrupar };
}
