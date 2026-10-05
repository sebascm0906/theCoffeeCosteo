import type { Rol } from '../supabase/database.types';
export type Area = 'insumos' | 'recetas' | 'precios' | 'configuracion' | 'usuarios';
const roles: Record<Area, Rol[]> = {
  insumos: ['compras'],
  recetas: ['operaciones'],
  precios: ['finanzas'],
  configuracion: ['finanzas'],
  usuarios: [],
};
export const puede = (rol: Rol, area: Area) => rol === 'admin' || roles[area].includes(rol);
