'use server';
import { sesion } from '@/lib/supabase/sesion';
import { validarPrecio } from '@/lib/portal/precios';
import { mensajeError } from '@/lib/portal/errores';
import { revalidatePath } from 'next/cache';
export async function guardarPrecio(d: {
  producto_id: string;
  tamano_id: string;
  canal_id?: string;
  precio: number | null;
  nota?: string;
}) {
  const { db } = await sesion('precios', false);
  try {
    validarPrecio(d.precio);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (d.canal_id) {
    const canal = await db.from('canales').select('regla_precio').eq('id', d.canal_id).single();
    if (canal.error || canal.data.regla_precio !== 'castigado')
      return { error: 'Este canal no acepta precio manual.' };
    const q =
      d.precio === null
        ? db
            .from('precio_canal_manual')
            .delete()
            .eq('producto_id', d.producto_id)
            .eq('tamano_id', d.tamano_id)
            .eq('canal_id', d.canal_id)
        : db.from('precio_canal_manual').upsert({
            producto_id: d.producto_id,
            tamano_id: d.tamano_id,
            canal_id: d.canal_id,
            precio: d.precio,
            nota: d.nota?.trim() || null,
          });
    const r = await q.select('producto_id');
    if (r.error) return { error: mensajeError(r.error) };
    if (!r.data.length) return { error: 'No se encontró el precio manual. Recarga la ficha.' };
  } else {
    const r = await db
      .from('producto_tamanos')
      .update({ precio_lista: d.precio })
      .eq('producto_id', d.producto_id)
      .eq('tamano_id', d.tamano_id)
      .select('producto_id');
    if (r.error) return { error: mensajeError(r.error) };
    if (!r.data.length) return { error: 'El tamaño cambió o ya no existe. Recarga la ficha.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
