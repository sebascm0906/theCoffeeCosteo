import { expect, it, vi } from 'vitest';
import { isStepCount, streamText, type Tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
const m = vi.hoisted(() => ({ consultar: vi.fn() }));
vi.mock('../../lib/mcp/herramientas', async () => {
  const { z } = await import('zod');
  return {
    crearConsultas: () => [
      { nombre: 'consultar_costos', descripcion: 'Costos', esquema: z.object({}), ejecutar: m.consultar },
    ],
  };
});
import { herramientasChat } from '../../lib/chat/herramientas';
import type { Db } from '../../lib/portal/consultas';
const uso = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const flujo = (partes: LanguageModelV4StreamPart[]) =>
  new ReadableStream<LanguageModelV4StreamPart>({
    start(c) {
      for (const parte of partes) c.enqueue(parte);
      c.close();
    },
  });
it('ejecuta consultas de lectura y entrega texto y resultados por el protocolo real del SDK', async () => {
  m.consultar.mockResolvedValue({ moneda: 'MXN', costo: 0, precio_manual: null });
  const model = new MockLanguageModelV4({
    doStream: [
      {
        stream: flujo([
          { type: 'stream-start', warnings: [] },
          { type: 'tool-call', toolCallId: 'consulta-1', toolName: 'consultar_costos', input: '{}' },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: uso },
        ]),
      },
      {
        stream: flujo([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'texto' },
          { type: 'text-delta', id: 'texto', delta: 'El costo es $0 MXN.' },
          { type: 'text-end', id: 'texto' },
          { type: 'finish', finishReason: { unified: 'stop', raw: 'end_turn' }, usage: uso },
        ]),
      },
    ],
  });
  const resultado = streamText({
    model,
    messages: [{ role: 'user', content: 'Consulta costos' }],
    tools: herramientasChat({} as Db, new AbortController().signal),
    stopWhen: isStepCount(4),
  });
  const response = resultado.toUIMessageStreamResponse({ sendReasoning: false });
  const texto = await response.text();
  expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
  expect(m.consultar).toHaveBeenCalledWith({});
  expect(model.doStreamCalls).toHaveLength(2);
  expect(texto).toContain('tool-output-available');
  expect(texto).toContain('El costo es $0 MXN.');
  expect(texto).toContain('[DONE]');
});
it('acota consultas de herramientas y resultados extensos', async () => {
  m.consultar.mockClear();
  m.consultar.mockResolvedValue({ costo: 10 });
  const h = herramientasChat({} as Db, new AbortController().signal).consultar_costos as Tool<
    unknown,
    unknown
  >;
  const opciones = { toolCallId: '1', messages: [], context: undefined };
  for (let i = 0; i < 8; i++) await h.execute!({}, opciones);
  expect(await h.execute!({}, opciones)).toMatchObject({ error: expect.stringContaining('Límite') });
  expect(m.consultar).toHaveBeenCalledTimes(8);
  m.consultar.mockResolvedValue({ texto: 'x'.repeat(24001) });
  const grande = herramientasChat({} as Db, new AbortController().signal).consultar_costos as Tool<
    unknown,
    unknown
  >;
  expect(await grande.execute!({}, opciones)).toMatchObject({ error: expect.stringContaining('extenso') });
});
