import { configuracion } from '../supabase/config';
export const URL_PORTAL = 'https://the-coffee-costeo.vercel.app';
export const URL_MCP = `${URL_PORTAL}/mcp`;
export function emisorMcp() {
  return `${configuracion().url.replace(/\/$/, '')}/auth/v1`;
}
