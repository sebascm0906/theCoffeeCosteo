import { describe, expect, it } from 'vitest';
import { detectarSubrecetas, type LineaLimpia } from '../../scripts/migracion/subrecetas';

let fila = 0;
const mix = (producto: string, insumo: string, cantidades: LineaLimpia['cantidades']): LineaLimpia =>
  ({ fila: ++fila, producto, insumo, clasificacion: 'MIX', cantidades });
const costos = new Map([['AGUA', 0], ['MATCHA', 1.2], ['CHAI', 0.5], ['LIMON', 0.05], ['AZUCAR', 0.05]]);

describe('detectarSubrecetas', () => {
  const lineas: LineaLimpia[] = [
    mix('Matcha Latte', 'AGUA', { Chica: 32.14, Grande: 40.18 }),
    mix('Matcha Latte', 'MATCHA', { Chica: 3.86, Grande: 4.82 }),
    mix('Matcha Iced', 'AGUA', { Chica: 32.14, Grande: 40.179 }),
    mix('Matcha Iced', 'MATCHA', { Chica: 3.86, Grande: 4.821 }),
    mix('Matcha Frappé', 'AGUA', { Único: 32.14 }),
    mix('Matcha Frappé', 'MATCHA', { Único: 3.86 }),
    mix('Chai Iced', 'AGUA', { Chica: 32 }),
    mix('Chai Iced', 'CHAI', { Chica: 4 }),
    mix('Chai Latte', 'AGUA', { Chica: 42 }),
    mix('Chai Latte', 'CHAI', { Chica: 4 }),
    mix('Limonada', 'LIMON', { Único: 16 }),
    { fila: ++fila, producto: 'Matcha Latte', insumo: 'VASO', clasificacion: 'DESECHABLE', cantidades: { Chica: 1 } },
  ];
  const r = detectarSubrecetas(lineas, costos);

  it('agrupa productos con la misma proporción en una sub-receta de lote 1000', () => {
    expect(r.subrecetas).toHaveLength(1);
    const s = r.subrecetas[0];
    expect(s.nombre).toBe('Mix MATCHA');
    expect(s.rendimiento).toBe(1000);
    expect(s.productos).toEqual(['Matcha Latte', 'Matcha Iced', 'Matcha Frappé']);
    expect(s.componentes.map((c) => c.insumo)).toEqual(['AGUA', 'MATCHA']);
    expect(s.componentes[1].cantidad).toBeCloseTo((3.86 / 36) * 1000, 4);
  });

  it('cada producto usa la sub-receta con la cantidad que conserva exactamente su costo', () => {
    const uso = r.usos.find((u) => u.producto === 'Matcha Iced')!;
    expect(uso.subreceta).toBe('Mix MATCHA');
    expect(uso.filas).toHaveLength(2);
    expect(uso.cantidades.Chica).toBeCloseTo(36, 4);
    expect(uso.cantidades.Grande).toBeCloseTo(45, 0);                 // ≈ total del mix
    const s = r.subrecetas[0];
    const costoPorUnidad = s.componentes.reduce((acc, c) => acc + (c.cantidad / s.rendimiento) * costos.get(c.insumo)!, 0);
    expect(uso.cantidades.Chica! * costoPorUnidad).toBeCloseTo(3.86 * 1.2, 5);
    expect(uso.cantidades.Grande! * costoPorUnidad).toBeCloseTo(4.821 * 1.2, 5);  // grande con proporción redondeada distinta
  });

  it('no agrupa un mix cuya proporción cambia entre tamaños', () => {
    const r2 = detectarSubrecetas([
      mix('Sora Iced', 'AGUA', { Chica: 35.64, Grande: 44.55 }),
      mix('Sora Iced', 'LIMON', { Chica: 100, Grande: 200 }),
    ], costos);
    expect(r2.sinAgrupar[0]).toMatchObject({ producto: 'Sora Iced', motivo: 'Proporción distinta entre tamaños' });
  });

  it('no mezcla proporciones distintas aunque los insumos sean los mismos', () => {
    const motivos = Object.fromEntries(r.sinAgrupar.map((s) => [s.producto, s.motivo]));
    expect(motivos['Chai Iced']).toMatch(/Proporción única/);
    expect(motivos['Chai Latte']).toMatch(/Proporción única/);
  });

  it('un mix de un solo insumo no es sub-receta', () => {
    expect(r.sinAgrupar.find((s) => s.producto === 'Limonada')?.motivo).toMatch(/Un solo insumo/);
  });

  it('solo toca líneas MIX', () => {
    expect(r.usos.flatMap((u) => u.filas)).not.toContain(fila);
  });
});
