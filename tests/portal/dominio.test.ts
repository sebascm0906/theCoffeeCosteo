import { expect, it } from 'vitest';
import { puede } from '../../lib/portal/permisos';
import { validarReceta, numeroCapturado, type Borrador } from '../../lib/portal/validacion';
import { validarRegistro } from '../../lib/portal/configuracion';
import { validarPrecio } from '../../lib/portal/precios';
import { rutaInterna } from '../../lib/portal/redireccion';
import { mensajeError } from '../../lib/portal/errores';
import { dependientes } from '../../lib/portal/dependencias';
import { indicadores } from '../../lib/portal/tablero';
import type { Linea, Receta, Resumen } from '../../lib/supabase/database.types';
it('separa receta, precios, catálogos y administración', () => {
  expect(puede('operaciones', 'precios')).toBe(false);
  expect(puede('finanzas', 'recetas')).toBe(false);
  expect(puede('compras', 'insumos')).toBe(true);
  expect(puede('admin', 'usuarios')).toBe(true);
});
it('valida recetas, rendimiento, cantidad y tamaños sin aceptar vacíos como cero', () => {
  const d: Borrador = {
    nombre: 'Latte',
    tipo: 'producto',
    categoria_id: 'c',
    rendimiento: null,
    unidad_rendimiento: null,
    activo: true,
    tamanos: ['t'],
    lineas: [{ insumo_id: 'i', subreceta_id: null, orden: 0, cantidades: [{ tamano_id: 't', cantidad: 0 }] }],
  };
  expect(validarReceta(d)).toEqual(d);
  expect(() => numeroCapturado('')).toThrow();
  expect(() => validarReceta({ ...d, tamanos: [] })).toThrow();
  expect(() =>
    validarReceta({ ...d, lineas: [{ ...d.lineas[0], cantidades: [{ tamano_id: 't', cantidad: NaN }] }] }),
  ).toThrow();
  expect(() => validarReceta({ ...d, tipo: 'subreceta', rendimiento: 0 })).toThrow();
});
it('restringe configuración a campos permitidos y porcentajes en fracción', () => {
  expect(validarRegistro('parametros', { iva: 0.16, margen_objetivo: 0.55, rol: 'admin' })).toEqual({
    iva: 0.16,
    margen_objetivo: 0.55,
  });
  expect(() => validarRegistro('parametros', { iva: 16, margen_objetivo: 0.55 })).toThrow();
  expect(() => validarRegistro('tamanos', { nombre: 'Grande', orden: 1.5 })).toThrow();
  expect(() => validarPrecio(0)).toThrow();
  expect(() => validarPrecio(NaN)).toThrow();
  expect(() => validarPrecio(null)).not.toThrow();
});
it('impide redirecciones externas y conserva error de conflicto', () => {
  for (const s of ['//evil.test', '/\\evil.test', 'https://evil.test', '/\nevil'])
    expect(rutaInterna(s)).toBe('/');
  expect(rutaInterna('/resumen')).toBe('/resumen');
  expect(mensajeError({ code: '40001', message: 'x' })).toContain('borrador');
});
it('resuelve usos indirectos sin duplicados incluso si hay ciclos en el fixture', () => {
  const lineas = [
    { receta_id: 's', insumo_id: 'i', subreceta_id: null },
    { receta_id: 'p', insumo_id: null, subreceta_id: 's' },
    { receta_id: 's', insumo_id: null, subreceta_id: 'p' },
  ] as Linea[];
  const recetas = [
    { id: 's', nombre: 'Mix' },
    { id: 'p', nombre: 'Producto' },
  ] as Receta[];
  expect(dependientes(lineas, recetas, 'i', 'insumo').map((r) => r.id)).toEqual(['s', 'p']);
});
it('KPIs no duplican canales ni tamaños en conteos y excluyen inactivos del promedio', () => {
  const base = {
    producto_id: 'p',
    activo: true,
    canal: 'Mostrador',
    food_cost: 0.2,
    margen_pct: 0.4,
    margen_objetivo: 0.55,
    precio_lista: 50,
    margen: 20,
  } as Resumen;
  const filas = [
    base,
    { ...base, food_cost: 0.4 },
    { ...base, canal: 'Rappi', food_cost: 0.9, margen: -1 },
    { ...base, producto_id: 'otro', activo: false, food_cost: 0.8 },
    { ...base, producto_id: 'sin', precio_lista: null, food_cost: null, margen_pct: null },
  ];
  const r = indicadores(filas);
  expect(r.foodCost).toBeCloseTo(0.3);
  expect(r.bajoObjetivo).toBe(1);
  expect(r.sinPrecio).toBe(1);
  expect(r.pierdenDelivery).toBe(1);
});
