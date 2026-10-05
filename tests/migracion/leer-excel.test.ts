import { describe, expect, it } from 'vitest';
import { leerLibro, numero, texto } from '../../scripts/migracion/leer-excel';
import { escribirLibroFixture, filaResumen } from './fixture-libro';

describe('texto y numero', () => {
  it('limpian espacios y vacíos', () => {
    expect(texto('  CAFÉ   TOSTADO ')).toBe('CAFÉ TOSTADO');
    expect(texto('   ')).toBeNull();
    expect(texto(null)).toBeNull();
    expect(texto(12.5)).toBe('12.5');
    expect(numero(null)).toBe(0);
    expect(numero('3.5')).toBe(3.5);
    expect(numero('abc')).toBe(0);
  });
});

describe('leerLibro', () => {
  const ruta = escribirLibroFixture({
    insumos: [
      ['CAFE', 'CEDIS', 'CAFÉ', 400, 1000, 'gr', 0.4, 1],
      [null, null, null, null, null, null],
      ['CREMA  CHOBANI', null, null, 90, 900, 'ml'],
    ],
    recetario: [
      ['BEBIDA FRÍA', 'Latte', 'CAFÉ', 'CAFE', 18, 20],
      [null, 'Latte', null, 'agua', 100, null],
    ],
    resumen: [filaResumen({ categoria: 'BEBIDA FRÍA', nombre: 'Latte', costoChica: 7.2, costoGrande: 8, precioChica: 65, precioRappi: 81, margenRappi: 31.1, alerta: 'Margen bajo el objetivo' })],
    auditoria: [
      ['1 · LÍNEAS ELIMINADAS'], ['Producto', 'Insumo', 'Acción'], ['Latte', 'AGUA', 'Se dejó una sola línea'],
      [], ['2 · NOMBRES UNIFICADOS'], ['Antes', 'Después'], ['Late', 'Latte'],
    ],
    correcciones: [['Latte', 'CH', 'CAFE', 16, 18, 0.8, 'gramaje ajustado', 'RECETARIO OFICIAL 2026']],
  });
  const libro = leerLibro(ruta);

  it('lee parámetros por etiqueta', () => {
    expect(libro.parametros).toEqual({ iva: 0.16, comisionRappi: 0.18, envaseRappi: 6.14, markupMaxRappi: 0.25, margenObjetivo: 0.55 });
  });

  it('lee insumos saltando filas vacías y conservando nulos', () => {
    expect(libro.insumos).toEqual([
      { fila: 5, nombre: 'CAFE', proveedor: 'CEDIS', categoria: 'CAFÉ', costoPaquete: 400, presentacion: 1000, unidad: 'gr' },
      { fila: 7, nombre: 'CREMA CHOBANI', proveedor: null, categoria: null, costoPaquete: 90, presentacion: 900, unidad: 'ml' },
    ]);
  });

  it('lee líneas del recetario con cantidades vacías en 0', () => {
    expect(libro.lineas).toEqual([
      { fila: 5, producto: 'Latte', clasificacion: 'CAFÉ', insumo: 'CAFE', cantChica: 18, cantGrande: 20 },
      { fila: 6, producto: 'Latte', clasificacion: null, insumo: 'agua', cantChica: 100, cantGrande: 0 },
    ]);
  });

  it('lee el resumen con costos, precios, Rappi y alerta', () => {
    expect(libro.productos).toEqual([{
      fila: 5, categoria: 'BEBIDA FRÍA', nombre: 'Latte', costoChica: 7.2, costoGrande: 8, precioChica: 65, precioGrande: 0,
      precioRappi: 81, margenRappi: 31.1, alerta: 'Margen bajo el objetivo',
    }]);
  });

  it('lee auditoría por secciones y correcciones con antes/después', () => {
    expect(libro.cambios).toEqual([
      { hoja: 'Auditoria', seccion: '1 · LÍNEAS ELIMINADAS', campo: 'Latte | AGUA | Se dejó una sola línea', anterior: null, nuevo: null, nota: '1 · LÍNEAS ELIMINADAS' },
      { hoja: 'Auditoria', seccion: '2 · NOMBRES UNIFICADOS', campo: 'Late | Latte', anterior: null, nuevo: null, nota: '2 · NOMBRES UNIFICADOS' },
      { hoja: 'Correcciones', seccion: 'Correcciones', campo: 'Latte · CH · CAFE', anterior: '16', nuevo: '18', nota: 'gramaje ajustado — RECETARIO OFICIAL 2026' },
    ]);
  });

  it('acepta un libro con todas las hojas pero sin datos', () => {
    const vacio = leerLibro(escribirLibroFixture());
    expect([vacio.insumos, vacio.lineas, vacio.productos, vacio.cambios]).toEqual([[], [], [], []]);
  });
});
