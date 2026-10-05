import { describe, expect, it } from 'vitest';
import { construirPlanCarga } from '../../scripts/migracion/plan-carga';
import { libroDePrueba } from './libro-de-prueba';

describe('construirPlanCarga', () => {
  const plan = construirPlanCarga(libroDePrueba());
  const receta = (nombre: string) => plan.recetas.find((r) => r.nombre === nombre)!;

  it('liga insumos del recetario sin distinguir mayúsculas ni espacios', () => {
    const agua = plan.insumos.find((i) => i.nombre === 'AGUA')!;
    const sub = receta('Mix MATCHA');
    expect(plan.lineas.some((l) => l.recetaId === sub.id && l.insumoId === agua.id)).toBe(true);
  });

  it('reemplaza las líneas MIX por una línea de sub-receta y deja las demás', () => {
    const p = receta('Matcha Latte');
    const lineas = plan.lineas.filter((l) => l.recetaId === p.id);
    expect(lineas).toHaveLength(2);
    expect(lineas[0].subrecetaId).toBe(receta('Mix MATCHA').id);
    const cant = plan.cantidades.filter((c) => c.lineaId === lineas[0].id);
    expect(cant.map((c) => c.tamano)).toEqual(['Chica', 'Grande']);
    expect(cant[0].cantidad).toBeCloseTo(36, 4);
    expect(cant[1].cantidad).toBeCloseTo(45, 0);
  });

  it('crea la sub-receta con lote 1000 ml y cantidades sin tamaño', () => {
    const s = receta('Mix MATCHA');
    expect(s).toMatchObject({ tipo: 'subreceta', categoriaId: null, rendimiento: 1000, unidadRendimiento: 'ml' });
    const lineas = plan.lineas.filter((l) => l.recetaId === s.id);
    expect(plan.cantidades.filter((c) => lineas.some((l) => l.id === c.lineaId)).every((c) => c.tamano === null)).toBe(true);
  });

  it('asigna tamaños y precios (0 → sin precio)', () => {
    const tamanos = (n: string) => plan.productoTamanos.filter((t) => t.productoId === receta(n).id).map((t) => [t.tamano, t.precioLista]);
    expect(tamanos('Matcha Latte')).toEqual([['Chica', 70], ['Grande', null]]);
    expect(tamanos('Matcha Iced')).toEqual([['Chica', null], ['Grande', null]]);
    expect(tamanos('Agua sola')).toEqual([['Único', 10]]);
  });

  it('unifica categorías y reporta equivalencias', () => {
    expect(plan.categoriasProducto.map((c) => c.nombre).sort()).toEqual(['BEBIDAS CALIENTES', 'Sandwiches']);
    expect(plan.equivalencias).toContainEqual({ original: 'SANDWICHES', final: 'Sandwiches', productos: 1 });
  });

  it('avisa líneas sin cantidad, presentación ajustada y unifica pcs → pza', () => {
    expect(plan.avisos.map((a) => a.tipo)).toEqual(expect.arrayContaining(['Línea sin cantidad', 'Presentación ajustada']));
    expect(plan.insumos.find((i) => i.nombre === 'VASO')!.unidad).toBe('pza');
  });

  it('pasa el historial del Excel y los parámetros', () => {
    expect(plan.historial).toEqual([{ tabla: 'excel_correcciones', campo: 'Matcha Latte · CH · MATCHA', anterior: '3.5', nuevo: '3.86', nota: 'gramaje ajustado' }]);
    expect(plan.rappi).toEqual({ comision: 0.18, envase: 6.14, markupMax: 0.25 });
  });
});
