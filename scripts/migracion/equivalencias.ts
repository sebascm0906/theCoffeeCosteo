/**
 * Categorías de producto del Excel → categoría final en el portal.
 * PROPUESTA: Finanzas/Dirección la valida en el reporte de migración antes de aplicar.
 * Las categorías que no aparecen aquí se migran con su nombre original.
 */
export const EQUIVALENCIAS_CATEGORIA: Record<string, string> = {
  SANDWICHES: 'Sandwiches',
  Sandwiches: 'Sandwiches',
  'GELATO FRAPPÉ': 'Gelato Frappés',
  'Gelato Frappés': 'Gelato Frappés',
  'PUMPKIN SPICE FRAPPÉ': 'Seasonal',
  'PUMPKIN SPICE ICED LATTE': 'Seasonal',
  'PUMPKIN SPICE LATTE': 'Seasonal',
  Seasonal: 'Seasonal',
};
