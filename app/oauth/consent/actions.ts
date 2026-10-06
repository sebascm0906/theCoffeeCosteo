'use server';
import { redirect } from 'next/navigation';
import { sesion } from '@/lib/supabase/sesion';
import { idAutorizacion, retornoClaude } from '@/lib/mcp/consentimiento';
export async function decidir(form: FormData) {
  const { db } = await sesion(undefined, false);
  const proteccion = await db.rpc('mcp_lectura_habilitada');
  if (proteccion.error || proteccion.data !== true)
    throw new Error('Publica primero la migración de consultas MCP.');
  const id = idAutorizacion(form.get('authorization_id'));
  const aceptar = form.get('decision') === 'aceptar';
  const detalles = await db.auth.oauth.getAuthorizationDetails(id);
  if (detalles.error || !detalles.data) throw new Error('El enlace venció. Vuelve a conectar Claude.');
  if ('redirect_url' in detalles.data) redirect(retornoClaude(detalles.data.redirect_url));
  retornoClaude(detalles.data.redirect_uri);
  const r = aceptar
    ? await db.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await db.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (r.error || !r.data) throw new Error('No se pudo completar la autorización. Vuelve a conectar Claude.');
  redirect(retornoClaude(r.data.redirect_url));
}
