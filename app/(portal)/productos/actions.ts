'use server';
import { sesion } from '@/lib/supabase/sesion';
import { validarReceta, type Borrador } from '@/lib/portal/validacion';
import { mensajeError } from '@/lib/portal/errores';
import type { Json } from '@/lib/supabase/database.types';
import { revalidatePath } from 'next/cache';
export async function guardarReceta(d: Borrador) {
  const { db } = await sesion('recetas', false);
  try {
    validarReceta(d);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const r = await db.rpc('guardar_receta', { p_datos: d as unknown as Json });
  if (r.error) return { error: mensajeError(r.error) };
  revalidatePath('/', 'layout');
  return { id: (r.data as { id: string }).id };
}
