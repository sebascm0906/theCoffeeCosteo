'use server';
import { sesion } from '@/lib/supabase/sesion';
import { campos, areas, validarRegistro, type TablaEditable } from '@/lib/portal/configuracion';
import { puede } from '@/lib/portal/permisos';
import { mensajeError } from '@/lib/portal/errores';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/lib/supabase/database.types';
export async function guardarRegistro(
  tabla: TablaEditable,
  id: string | number | null,
  datos: Record<string, unknown>,
) {
  const { db, perfil } = await sesion(undefined, false);
  if (!Object.hasOwn(campos, tabla) || !puede(perfil.rol, areas[tabla]))
    return { error: 'No tienes permiso para esta acción.' };
  if (id === null && (tabla === 'parametros' || tabla === 'canales'))
    return { error: 'No se pueden crear parámetros ni canales adicionales.' };
  let d: ReturnType<typeof validarRegistro>;
  try {
    d = validarRegistro(tabla, datos);
  } catch (e) {
    return { error: (e as Error).message };
  }
  // Escribir cada tabla con su contrato concreto evita la sobrecarga de uniones del SDK.
  const payload = <T extends TablaEditable>() => d as Database['public']['Tables'][T]['Update'];
  const query = (() => {
    switch (tabla) {
      case 'insumos':
        return id === null
          ? db.from('insumos').insert(payload<'insumos'>())
          : db.from('insumos').update(payload<'insumos'>()).eq('id', String(id));
      case 'proveedores':
        return id === null
          ? db.from('proveedores').insert(payload<'proveedores'>())
          : db.from('proveedores').update(payload<'proveedores'>()).eq('id', String(id));
      case 'categorias_insumo':
        return id === null
          ? db.from('categorias_insumo').insert(payload<'categorias_insumo'>())
          : db.from('categorias_insumo').update(payload<'categorias_insumo'>()).eq('id', String(id));
      case 'categorias_producto':
        return id === null
          ? db.from('categorias_producto').insert(payload<'categorias_producto'>())
          : db.from('categorias_producto').update(payload<'categorias_producto'>()).eq('id', String(id));
      case 'tamanos':
        return id === null
          ? db.from('tamanos').insert(payload<'tamanos'>())
          : db.from('tamanos').update(payload<'tamanos'>()).eq('id', String(id));
      case 'parametros':
        return db.from('parametros').update(payload<'parametros'>()).eq('id', Number(id));
      case 'canales':
        return db.from('canales').update(payload<'canales'>()).eq('id', String(id));
    }
  })();
  const r = await query.select('id');
  if (r.error) return { error: mensajeError(r.error) };
  if (!r.data.length) return { error: 'El registro ya no existe o no tienes permiso.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}
