import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { puede } from '@/lib/portal/permisos';
import { CatalogoRecetas } from './catalogo';
export async function ListaRecetas({ tipo, q = '' }: { tipo: 'producto' | 'subreceta'; q?: string }) {
  const { db, perfil } = await sesion();
  const filas = (await todas(db, 'recetas', 'nombre,id'))
    .filter((r) => r.tipo === tipo)
    .map(({ id, nombre, activo }) => ({ id, nombre, activo }));
  return <CatalogoRecetas tipo={tipo} filas={filas} consulta={q} editable={puede(perfil.rol, 'recetas')} />;
}
