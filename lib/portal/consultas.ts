import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
export type Db = SupabaseClient<Database>;
type Fuente = keyof Database['public']['Tables'] | keyof Database['public']['Views'];
type Fila<T extends Fuente> = T extends keyof Database['public']['Tables'] ? Database['public']['Tables'][T]['Row'] : T extends keyof Database['public']['Views'] ? Database['public']['Views'][T]['Row'] : never;
// Orden estable y páginas inferiores al límite por defecto de PostgREST.
export async function todas<T extends Fuente>(db: Db, tabla: T, orden: string): Promise<Fila<T>[]> {
  const filas: Fila<T>[] = [];
  for (let desde = 0; ; desde += 500) {
    // La sobrecarga del SDK separa tablas/vistas; Fuente limita los nombres válidos.
    let q = db.from(tabla as keyof Database['public']['Tables']).select('*');
    for (const campo of orden.split(',')) q = q.order(campo);
    const r = await q.range(desde, desde + 499);
    if (r.error) throw new Error(`No se pudo consultar ${tabla}. Intenta de nuevo.`);
    const pagina = r.data as unknown as Fila<T>[];
    filas.push(...pagina); if (pagina.length < 500) return filas;
  }
}
export const dinero = (n: number | null) => n === null ? 'Sin precio' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
export const porcentaje = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 }).format(n);
