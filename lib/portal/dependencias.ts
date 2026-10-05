import type { Linea, Receta } from '../supabase/database.types';
export function dependientes(lineas: Linea[], recetas: Receta[], id: string, tipo: 'insumo' | 'subreceta') {
  const vistos = new Set<string>();
  const pendientes = [id];
  while (pendientes.length) {
    const componente = pendientes.pop()!;
    for (const l of lineas)
      if (
        (componente === id && tipo === 'insumo'
          ? l.insumo_id === componente
          : l.subreceta_id === componente) &&
        !vistos.has(l.receta_id)
      ) {
        vistos.add(l.receta_id);
        pendientes.push(l.receta_id);
      }
  }
  return recetas.filter((r) => vistos.has(r.id));
}
