import { redirect } from 'next/navigation';
import { servidor } from './servidor';
import { puede, type Area } from '../portal/permisos';
export async function sesion(area?: Area) {
  const db = await servidor();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect('/login');
  const r = await db.from('perfiles').select('*').eq('user_id', data.user.id).maybeSingle();
  if (r.error) throw new Error('No se pudo consultar tu perfil. Intenta de nuevo.');
  if (!r.data?.activo) redirect('/login?aviso=perfil');
  if (area && !puede(r.data.rol, area)) throw new Error('No tienes permiso para esta acción');
  return { db, perfil: r.data };
}
