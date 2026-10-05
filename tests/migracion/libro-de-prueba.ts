import type { LibroExcel } from '../../scripts/migracion/tipos';

export const libroDePrueba = (): LibroExcel => ({
  parametros: { iva: 0.16, comisionRappi: 0.18, envaseRappi: 6.14, markupMaxRappi: 0.25, margenObjetivo: 0.55 },
  insumos: [
    { fila: 5, nombre: 'AGUA', proveedor: 'Agua', categoria: 'AGUA', costoPaquete: 0, presentacion: 0, unidad: 'ml' },
    { fila: 6, nombre: 'MATCHA', proveedor: 'CEDIS', categoria: 'INSUMOS', costoPaquete: 1200, presentacion: 1000, unidad: 'gr' },
    { fila: 7, nombre: 'VASO', proveedor: 'CEDIS', categoria: 'DESECHABLE', costoPaquete: 100, presentacion: 50, unidad: 'pcs' },
  ],
  lineas: [
    { fila: 5, producto: 'Matcha Latte', clasificacion: 'MIX', insumo: 'agua ', cantChica: 32.14, cantGrande: 40.18 },
    { fila: 6, producto: 'Matcha Latte', clasificacion: 'MIX', insumo: 'MATCHA', cantChica: 3.86, cantGrande: 4.82 },
    { fila: 7, producto: 'Matcha Latte', clasificacion: 'DESECHABLE', insumo: 'VASO', cantChica: 1, cantGrande: 1 },
    { fila: 8, producto: 'Matcha Iced', clasificacion: 'MIX', insumo: 'AGUA', cantChica: 32.14, cantGrande: 40.18 },
    { fila: 9, producto: 'Matcha Iced', clasificacion: 'MIX', insumo: 'MATCHA', cantChica: 3.86, cantGrande: 4.82 },
    { fila: 10, producto: 'Agua sola', clasificacion: 'AGUA', insumo: 'AGUA', cantChica: 0, cantGrande: 0 },
  ],
  productos: [
    { fila: 5, categoria: 'BEBIDAS CALIENTES', nombre: 'Matcha Latte', costoChica: 6.632, costoGrande: 7.784, precioChica: 70, precioGrande: 0, precioRappi: 80, margenRappi: 0, alerta: '' },
    { fila: 6, categoria: 'SANDWICHES', nombre: 'Matcha Iced', costoChica: 4.632, costoGrande: 5.784, precioChica: 0, precioGrande: 0, precioRappi: 0, margenRappi: 0, alerta: 'Falta precio de lista' },
    { fila: 7, categoria: 'Sandwiches', nombre: 'Agua sola', costoChica: 0, costoGrande: 0, precioChica: 10, precioGrande: 0, precioRappi: 12, margenRappi: 0, alerta: '' },
  ],
  cambios: [{ hoja: 'Correcciones', seccion: 'Correcciones', campo: 'Matcha Latte · CH · MATCHA', anterior: '3.5', nuevo: '3.86', nota: 'gramaje ajustado' }],
});
