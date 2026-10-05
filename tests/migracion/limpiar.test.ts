import { describe, expect, it } from 'vitest';
import {
  type Aviso, POR_ASIGNAR, cantidadesPorTamano, clave, limpiarInsumos, mapearCategoriaProducto, normalizarUnidad, tamanosDeProducto,
} from '../../scripts/migracion/limpiar';
import type { InsumoExcel, LineaExcel } from '../../scripts/migracion/tipos';

const insumo = (o: Partial<InsumoExcel>): InsumoExcel => ({
  fila: 5, nombre: 'X', proveedor: 'CEDIS', categoria: 'INSUMOS', costoPaquete: 10, presentacion: 100, unidad: 'gr', ...o,
});
const linea = (o: Partial<LineaExcel>): LineaExcel => ({
  fila: 5, producto: 'P', clasificacion: null, insumo: 'X', cantChica: 0, cantGrande: 0, ...o,
});

describe('clave', () => {
  it('ignora mayúsculas y espacios de más, como MATCH de Excel', () => {
    expect(clave('  agua ')).toBe(clave('AGUA'));
    expect(clave('Café  Tostado')).toBe('CAFÉ TOSTADO');
  });
});

describe('normalizarUnidad', () => {
  it('unifica pcs y pza', () => {
    expect(normalizarUnidad('pcs')).toBe('pza');
    expect(normalizarUnidad('PZA')).toBe('pza');
    expect(normalizarUnidad(' gr ')).toBe('gr');
    expect(normalizarUnidad('ml')).toBe('ml');
  });
  it('rechaza unidades desconocidas', () => {
    expect(() => normalizarUnidad('kg')).toThrow('Unidad desconocida: "kg"');
    expect(() => normalizarUnidad(null)).toThrow();
  });
});

describe('limpiarInsumos', () => {
  it('presentación 0 queda en 1 con costo 0 (igual que IFERROR del Excel) y avisa', () => {
    const avisos: Aviso[] = [];
    const [agua] = limpiarInsumos([insumo({ nombre: 'AGUA', costoPaquete: 0, presentacion: 0, unidad: 'ml' })], avisos);
    expect(agua).toMatchObject({ costoPaquete: 0, presentacion: 1 });
    expect(avisos.map((a) => a.tipo)).toEqual(['Presentación ajustada']);
  });
  it('costo con presentación 0 queda en costo 0 y avisa', () => {
    const avisos: Aviso[] = [];
    const [x] = limpiarInsumos([insumo({ costoPaquete: 50, presentacion: 0 })], avisos);
    expect(x).toMatchObject({ costoPaquete: 0, presentacion: 1 });
    expect(avisos[0].detalle).toContain('50');
  });
  it('proveedor o categoría vacíos quedan POR ASIGNAR y avisa', () => {
    const avisos: Aviso[] = [];
    const [x] = limpiarInsumos([insumo({ nombre: 'Chobani', proveedor: null, categoria: null })], avisos);
    expect(x).toMatchObject({ proveedor: POR_ASIGNAR, categoria: POR_ASIGNAR });
    expect(avisos).toHaveLength(2);
  });
  it('rechaza nombres repetidos que solo difieren en mayúsculas o espacios', () => {
    expect(() => limpiarInsumos([insumo({ nombre: 'AGUA' }), insumo({ nombre: 'agua ' })], [])).toThrow(/repetido/);
  });
});

describe('categorías de producto', () => {
  it('unifica duplicados y temporada, deja intactas las demás', () => {
    expect(mapearCategoriaProducto('SANDWICHES')).toBe('Sandwiches');
    expect(mapearCategoriaProducto('Sandwiches')).toBe('Sandwiches');
    expect(mapearCategoriaProducto('GELATO FRAPPÉ')).toBe('Gelato Frappés');
    expect(mapearCategoriaProducto('PUMPKIN SPICE LATTE')).toBe('Seasonal');
    expect(mapearCategoriaProducto('Cold')).toBe('Cold');
  });
});

describe('tamaños', () => {
  it('Chica y Grande si alguna línea tiene cantidad grande; si no, Único', () => {
    expect(tamanosDeProducto([linea({ cantChica: 18 }), linea({ cantGrande: 20 })])).toEqual(['Chica', 'Grande']);
    expect(tamanosDeProducto([linea({ cantChica: 1 })])).toEqual(['Único']);
    expect(tamanosDeProducto([])).toEqual(['Único']);
  });
  it('reparte cantidades por tamaño omitiendo ceros', () => {
    expect(cantidadesPorTamano(linea({ cantChica: 18, cantGrande: 20 }), ['Chica', 'Grande'])).toEqual({ Chica: 18, Grande: 20 });
    expect(cantidadesPorTamano(linea({ cantChica: 0, cantGrande: 20 }), ['Chica', 'Grande'])).toEqual({ Grande: 20 });
    expect(cantidadesPorTamano(linea({ cantChica: 1, cantGrande: 0 }), ['Único'])).toEqual({ Único: 1 });
  });
});
