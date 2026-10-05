'use server';
import { sesion } from '@/lib/supabase/sesion';
export async function historialReceta(id: string, antes: number) {
  const { db } = await sesion(undefined, false);
  const r = await db
    .from('bitacora')
    .select('*')
    .eq('receta_id', id)
    .lt('id', antes)
    .order('id', { ascending: false })
    .limit(50);
  if (r.error) throw new Error('No se pudo consultar el historial. Intenta de nuevo.');
  return r.data;
}
