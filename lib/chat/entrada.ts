import { z } from 'zod';

export const MAX_TURNOS = 12;
// Solo texto. Nunca aceptar resultados de herramientas, roles de sistema ni archivos del cliente.
const mensaje = z.object({
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.object({ type: z.literal('text'), text: z.string().max(6000) })).max(8),
});
const cuerpo = z.object({
  messages: z
    .array(mensaje)
    .min(1)
    .max(MAX_TURNOS * 2 - 1),
});
export function mensajesModelo(entrada: unknown) {
  const { messages } = cuerpo.parse(entrada);
  if (messages.at(-1)?.role !== 'user') throw new Error('Falta la pregunta');
  if (messages.filter((m) => m.role === 'user').length > MAX_TURNOS) throw new Error('Conversación extensa');
  const salida = messages.map((m) => ({ role: m.role, content: m.parts.map((p) => p.text).join('\n') }));
  if (salida.some((m) => !m.content.trim()) || salida.reduce((n, m) => n + m.content.length, 0) > 24000) {
    throw new Error('Conversación extensa o vacía');
  }
  return salida;
}

export function enlacePortal(href: string | undefined) {
  return href && /^\/(?:productos|subrecetas)\/[0-9a-f-]{36}$/i.test(href) ? href : undefined;
}
