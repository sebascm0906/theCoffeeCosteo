import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { configuracion } from '../supabase/config';
import { emisorMcp } from './config';
export class ErrorMcp extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
export function clienteMcp(token: string) {
  const { url, key } = configuracion();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
export async function autenticarMcp(token: string) {
  const db = clienteMcp(token);
  const verificacion = await db.auth.getClaims(token);
  const claims = verificacion.data?.claims;
  if (
    verificacion.error ||
    !claims ||
    claims.iss !== emisorMcp() ||
    claims.aud !== 'authenticated' ||
    claims.role !== 'authenticated' ||
    typeof claims.client_id !== 'string' ||
    !claims.client_id ||
    !claims.exp ||
    claims.exp <= Date.now() / 1000
  ) {
    throw new ErrorMcp(401, 'Inicia sesión desde el conector de Claude.');
  }
  const usuario = await db.auth.getUser(token);
  if (usuario.error || !usuario.data.user || usuario.data.user.id !== claims.sub) {
    throw new ErrorMcp(401, 'La autorización venció. Vuelve a conectar Claude.');
  }
  const perfil = await db.from('perfiles').select('user_id,activo').eq('user_id', claims.sub).maybeSingle();
  if (perfil.error) throw new ErrorMcp(503, 'No se pudo comprobar el acceso. Intenta de nuevo.');
  if (!perfil.data?.activo) throw new ErrorMcp(403, 'Necesitas un perfil activo en el portal.');
  const proteccion = await db.rpc('mcp_lectura_habilitada');
  if (proteccion.error || proteccion.data !== true) {
    throw new ErrorMcp(503, 'El administrador debe publicar la migración de consultas MCP.');
  }
  return db;
}
