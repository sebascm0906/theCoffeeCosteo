import { tool, type ToolSet } from 'ai';
import { crearConsultas } from '../mcp/herramientas';
import type { Db } from '../portal/consultas';

export function herramientasChat(db: Db, signal: AbortSignal): ToolSet {
  let llamadas = 0;
  return Object.fromEntries(
    crearConsultas(db).map((c) => [
      c.nombre,
      tool({
        description: c.descripcion,
        inputSchema: c.esquema,
        execute: async (entrada) => {
          signal.throwIfAborted();
          if (++llamadas > 8) return { error: 'Límite de consultas alcanzado. Acota la pregunta.' };
          try {
            const datos = await c.ejecutar(entrada);
            signal.throwIfAborted();
            if (JSON.stringify(datos).length > 24000)
              return { error: 'Resultado extenso. Consulta menos registros por página.' };
            return datos;
          } catch {
            return { error: 'No se pudo consultar. Revisa el identificador o intenta de nuevo.' };
          }
        },
      }),
    ]),
  );
}
